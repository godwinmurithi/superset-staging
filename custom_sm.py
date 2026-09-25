from flask_appbuilder.security.forms import RegisterUserDBForm
from flask_appbuilder.security.registerviews import RegisterUserDBView
from flask_babel import lazy_gettext
from flask import flash
from flask_appbuilder._compat import as_unicode
from superset.security import SupersetSecurityManager


class RegisterUserDBFormNoCaptcha(RegisterUserDBForm):
    """Same form minus reCAPTCHA — admin approval (below) is the actual
    spam gate here, so the widget was just dead weight (and, without a
    real Google site key, a visible "testing purposes only" watermark)."""

    recaptcha = None


class ApprovalRegisterUserDBView(RegisterUserDBView):
    """
    Self-registration without email/SMTP: creates the user immediately but
    inactive, so an admin has to flip "Is Active" in List Users before the
    account can log in. No confirmation email is sent because this
    environment has no SMTP server configured.
    """

    form = RegisterUserDBFormNoCaptcha
    message = lazy_gettext(
        "Thanks for registering. An administrator needs to approve your "
        "account before you can sign in."
    )
    error_message = lazy_gettext(
        "Could not complete your registration. Please contact an administrator."
    )

    def add_registration(self, username, first_name, last_name, email, password=""):
        sm = self.appbuilder.sm
        role = sm.find_role(sm.auth_user_registration_role)
        user = sm.add_user(
            username=username,
            first_name=first_name,
            last_name=last_name,
            email=email,
            role=role,
            password=password,
        )
        if not user:
            flash(as_unicode(self.error_message), "danger")
            return None
        user.active = False
        sm.update_user(user)
        flash(as_unicode(self.message), "info")
        return user


class CTISecurityManager(SupersetSecurityManager):
    registeruserdbview = ApprovalRegisterUserDBView
