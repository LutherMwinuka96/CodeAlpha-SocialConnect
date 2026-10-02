from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field

from .models import Notification


class NotificationActorSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    full_name = serializers.CharField(allow_blank=True)
    avatar = serializers.URLField(allow_null=True)


class NotificationSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ("id", "actor", "kind", "post_id", "comment_id", "is_read", "created_at")
        read_only_fields = fields

    @extend_schema_field(NotificationActorSerializer)
    def get_actor(self, obj):
        profile = getattr(obj.actor, "profile", None)
        avatar = None
        if profile and profile.avatar:
            request = self.context.get("request")
            avatar = request.build_absolute_uri(profile.avatar.url) if request else profile.avatar.url
        return {"id": obj.actor_id, "username": obj.actor.username, "full_name": obj.actor.full_name, "avatar": avatar}
