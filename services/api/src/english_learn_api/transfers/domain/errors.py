from typing import ClassVar

from english_learn_api.shared.errors import DomainError


class TransferNotFoundError(DomainError):
    """Unknown, expired or already claimed: one answer for all, so it reveals nothing."""

    code: ClassVar[str] = "transfer_not_found"
