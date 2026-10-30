from typing import ClassVar

from english_learn_api.shared.errors import DomainError


class DeviceConflictError(DomainError):
    """The device id is registered to another user. The client generates a new device id."""

    code: ClassVar[str] = "device_conflict"
