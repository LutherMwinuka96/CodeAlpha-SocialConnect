from apps.notifications.models import Notification
from rest_framework import status
from rest_framework.response import Response


def notify(recipient, actor, kind, *, post=None, comment=None):
    if recipient_id := getattr(recipient, "pk", recipient):
        actor_id = getattr(actor, "pk", actor)
        if recipient_id != actor_id:
            Notification.objects.create(recipient_id=recipient_id, actor_id=actor_id, kind=kind, post=post, comment=comment)


def api_error(message, http_status=status.HTTP_400_BAD_REQUEST, *, details=None, code="error"):
    return Response({"error": {"code": code, "message": message, "details": details}}, status=http_status)
