from typing import ClassVar

from english_learn_api.shared.errors import DomainError


class TransferNotFoundError(DomainError):
    """Unknown, expired or already claimed: one answer for all, so it reveals nothing."""

    code: ClassVar[str] = "transfer_not_found"


class TransferCapacityError(DomainError):
    """Too many transfers are waiting to be claimed; a new one is refused until some go."""

    code: ClassVar[str] = "transfer_capacity"


class CorruptTransferError(Exception):
    """A stored payload cannot be decoded (or inflates past its bound). Not a `DomainError`: the
    client gets a generic 500, and the message never carries payload bytes."""
