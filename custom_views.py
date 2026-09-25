import datetime

from flask import flash
from flask_appbuilder import Model, ModelView
from flask_appbuilder._compat import as_unicode
from flask_appbuilder.fieldwidgets import BS3TextFieldWidget
from flask_appbuilder.forms import DynamicForm
from flask_appbuilder.models.sqla.interface import SQLAInterface
from flask_appbuilder.views import PublicFormView
from flask_babel import lazy_gettext
from sqlalchemy import Boolean, Column, DateTime, Integer, String
from wtforms import StringField
from wtforms.validators import DataRequired, Email


class PasswordResetRequest(Model):
    """
    A logged-out user's self-service "forgot password" submission. There's
    no SMTP server in this environment, so this isn't a reset-link email —
    it's a queue an admin checks (Security > Password Reset Requests) and
    resolves by hand (e.g. `superset fab reset-password`), then contacts
    the user out of band.
    """

    __tablename__ = "cti_password_reset_request"

    id = Column(Integer, primary_key=True)
    username = Column(String(64), nullable=False)
    email = Column(String(256), nullable=False)
    requested_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    resolved = Column(Boolean, default=False, nullable=False)
    notes = Column(String(512))

    def __repr__(self):
        return f"{self.username} ({self.email})"


class PasswordResetRequestForm(DynamicForm):
    username = StringField(
        lazy_gettext("Username"),
        validators=[DataRequired()],
        widget=BS3TextFieldWidget(),
    )
    email = StringField(
        lazy_gettext("Email"),
        validators=[DataRequired(), Email()],
        widget=BS3TextFieldWidget(),
    )


class PasswordResetRequestView(PublicFormView):
    route_base = "/reset-password-request"
    form = PasswordResetRequestForm
    form_title = lazy_gettext("Request a password reset")
    message = lazy_gettext(
        "Thanks — your request was submitted. An administrator will reset "
        "your password and contact you."
    )
    redirect_url = "/login/"

    def form_post(self, form):
        self.appbuilder.session.add(
            PasswordResetRequest(username=form.username.data, email=form.email.data)
        )
        self.appbuilder.session.commit()
        flash(as_unicode(self.message), "info")


class PasswordResetRequestModelView(ModelView):
    datamodel = SQLAInterface(PasswordResetRequest)
    list_columns = ["username", "email", "requested_at", "resolved"]
    edit_columns = ["resolved", "notes"]
    show_columns = ["username", "email", "requested_at", "resolved", "notes"]
    base_order = ("requested_at", "desc")
    label_columns = {"requested_at": "Requested"}


def _grant_admin_permissions(appbuilder):
    sm = appbuilder.sm
    view_name = PasswordResetRequestModelView.__name__
    sm.add_view_menu(view_name)
    for perm_name in ("can_list", "can_show", "can_edit", "can_delete", "can_add"):
        sm.add_permission_view_menu(perm_name, view_name)
    admin_role = sm.add_role("Admin")
    for perm_name in ("can_list", "can_show", "can_edit", "can_delete", "can_add"):
        pvm = sm.find_permission_view_menu(perm_name, view_name)
        if pvm and pvm not in admin_role.permissions:
            sm.add_permission_role(admin_role, pvm)


def register_custom_views(app):
    appbuilder = app.appbuilder
    appbuilder.add_view_no_menu(PasswordResetRequestView)
    appbuilder.add_view(
        PasswordResetRequestModelView,
        "Password Reset Requests",
        icon="fa-key",
        category="Security",
    )

    # FLASK_APP_MUTATOR fires in init_app_in_ctx() *before* init_views(), in
    # a context where SecurityManager writes (add_role/add_permission_role
    # etc.) silently don't persist — confirmed by testing the identical
    # calls both here and via `superset shell` after boot: only the latter
    # actually lands in the DB. So defer the permission grant to the first
    # real request, which runs in the normal, fully-initialized app context.
    # Idempotent (get-or-create calls, guarded by a flag), so it's a no-op
    # on every request after the first.
    state = {"done": False}

    @app.before_request
    def _grant_once():
        if not state["done"]:
            _grant_admin_permissions(appbuilder)
            state["done"] = True
