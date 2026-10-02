from django.conf import settings
from django.db import models


class Notification(models.Model):
    FOLLOW = "follow"
    LIKE = "like"
    COMMENT = "comment"
    MENTION = "mention"
    TYPE_CHOICES = ((FOLLOW, "New follower"), (LIKE, "Like"), (COMMENT, "Comment"), (MENTION, "Mention"))

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_notifications")
    kind = models.CharField(max_length=12, choices=TYPE_CHOICES)
    post = models.ForeignKey("posts.Post", on_delete=models.CASCADE, null=True, blank=True, related_name="notifications")
    comment = models.ForeignKey("social.Comment", on_delete=models.CASCADE, null=True, blank=True, related_name="notifications")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("recipient", "is_read", "-created_at"), name="notif_recipient_read_idx")]

    def __str__(self):
        return f"{self.get_kind_display()} for {self.recipient}"
