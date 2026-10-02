from django.views.generic import TemplateView


class ProfilePageView(TemplateView):
    template_name = "profile/detail.html"
