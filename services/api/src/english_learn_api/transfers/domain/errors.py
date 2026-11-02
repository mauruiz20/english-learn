from typing import ClassVar

from english_learn_api.shared.errors import DomainError


class TransferNotFoundError(DomainError):
    """Unknown, expired or already claimed: one answer for all, so it reveals nothing."""

    code: ClassVar[str] = "transfer_not_found"


class TransferCapacityError(DomainError):
    """Too many transfers are waiting to be claimed; a new one is refused until some go."""

    code: ClassVar[str] = "transfer_capacity"
