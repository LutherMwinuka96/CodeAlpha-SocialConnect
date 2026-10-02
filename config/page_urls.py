from django.urls import path
from django.views.generic import TemplateView

from apps.core.pages import ProfilePageView

urlpatterns = [
    path("", TemplateView.as_view(template_name="feed/index.html"), name="home"),
    path("login/", TemplateView.as_view(template_name="auth/login.html"), name="login-page"),
    path("register/", TemplateView.as_view(template_name="auth/register.html"), name="register-page"),
    path("password-reset/", TemplateView.as_view(template_name="auth/password_reset.html"), name="password-reset-page"),
    path("search/", TemplateView.as_view(template_name="search/index.html"), name="search-page"),
    path("notifications/", TemplateView.as_view(template_name="notifications/index.html"), name="notifications-page"),
    path("saved/", TemplateView.as_view(template_name="feed/saved.html"), name="saved-page"),
    path("account/", TemplateView.as_view(template_name="account/settings.html"), name="account-page"),
    path("u/<str:username>/", ProfilePageView.as_view(), name="profile-page"),
    path("about/", TemplateView.as_view(template_name="pages/about.html"), name="about-page"),
    path("privacy/", TemplateView.as_view(template_name="pages/privacy.html"), name="privacy-page"),
    path("terms/", TemplateView.as_view(template_name="pages/terms.html"), name="terms-page"),
]
