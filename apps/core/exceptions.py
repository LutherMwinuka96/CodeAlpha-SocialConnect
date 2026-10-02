from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None
    data = response.data
    if isinstance(data, dict) and "detail" in data:
        message, details = str(data["detail"]), None
    else:
        message, details = "The request could not be completed.", data
    response.data = {"error": {"code": getattr(exc, "default_code", "error"), "message": message, "details": details}}
    return response
