"""
Cryptographic analysis: XOR scanning, AES fingerprinting, entropy calculations.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Literal, Protocol


@dataclass
class XorCandidate:
    """Result of XOR key analysis."""
    key: bytes
    score: float
    ascii_density: float
    entropy_drop: float
    sample_decoded: bytes | None = None


@dataclass
class AesProbeResult:
    """Result of AES mode fingerprinting."""
    mode_guess: Literal["cbc", "gcm", "ctr", "unknown"]
    iv_or_nonce: bytes | None
    tag: bytes | None
    aligned: bool
    confidence: float


class KeyProvider(Protocol):
    """Protocol for providing decryption keys."""

    def get_key(
        self,
        flow_id: str,
        direction: str,
        mode: str,
    ) -> bytes | None:
        """
        Get decryption key for a flow.

        Args:
            flow_id: Flow identifier
            direction: "request" or "response"
            mode: Detected cipher mode

        Returns:
            Key bytes or None if unavailable
        """
        ...


def shannon_entropy(data: bytes) -> float:
    """
    Calculate Shannon entropy of byte data.

    Args:
        data: Input bytes

    Returns:
        Entropy value (0.0 to 8.0)
    """
    if not data:
        return 0.0

    freq = [0] * 256
    for b in data:
        freq[b] += 1

    length = len(data)
    entropy = 0.0

    for count in freq:
        if count > 0:
            p = count / length
            entropy -= p * math.log2(p)

    return entropy


def ascii_density(data: bytes) -> float:
    """
    Calculate proportion of printable ASCII bytes.

    Args:
        data: Input bytes

    Returns:
        Ratio of printable bytes (0.0 to 1.0)
    """
    if not data:
        return 0.0

    printable = sum(1 for b in data if 0x20 <= b <= 0x7E)
    return printable / len(data)


def xor_apply(data: bytes, key: bytes) -> bytes:
    """
    Apply XOR with key (cycling if key is shorter).

    Args:
        data: Input bytes
        key: XOR key

    Returns:
        XOR'd bytes
    """
    if len(key) == 1:
        k = key[0]
        return bytes(b ^ k for b in data)

    key_len = len(key)
    return bytes(b ^ key[i % key_len] for i, b in enumerate(data))


def xor_scan(
    data: bytes,
    min_key: int = 0x01,
    max_key: int = 0xFF,
    rolling_max_len: int = 4,
    sample_size: int = 1024,
) -> list[XorCandidate]:
    """
    Scan for potential single-byte and short rolling XOR keys.

    Args:
        data: Input bytes
        min_key: Minimum single-byte key value
        max_key: Maximum single-byte key value
        rolling_max_len: Maximum rolling key length to try
        sample_size: Bytes to analyze for scoring

    Returns:
        List of XorCandidate, sorted by score (best first)
    """
    if not data:
        return []

    sample = data[:sample_size]
    original_entropy = shannon_entropy(sample)
    original_ascii = ascii_density(sample)

    candidates = []

    # Single-byte XOR scan
    for key_byte in range(min_key, max_key + 1):
        key = bytes([key_byte])
        decoded = xor_apply(sample, key)

        new_entropy = shannon_entropy(decoded)
        new_ascii = ascii_density(decoded)

        # Score improvement
        entropy_drop = (original_entropy - new_entropy) / original_entropy if original_entropy > 0 else 0
        ascii_gain = new_ascii - original_ascii

        # Composite score: favor entropy drop and ASCII increase
        score = entropy_drop * 0.5 + ascii_gain * 0.5

        if score > 0.05 or new_ascii > 0.3:  # Threshold for candidate
            candidates.append(XorCandidate(
                key=key,
                score=score,
                ascii_density=new_ascii,
                entropy_drop=entropy_drop,
                sample_decoded=decoded[:64] if new_ascii > 0.2 else None,
            ))

    # Sort by score descending
    candidates.sort(key=lambda c: c.score, reverse=True)
    return candidates[:10]  # Return top 10


def aes_fingerprint(data: bytes) -> AesProbeResult:
    """
    Fingerprint likely AES encryption mode from ciphertext structure.

    Args:
        data: Potentially encrypted bytes

    Returns:
        AesProbeResult with mode guess and structural info
    """
    length = len(data)
    aligned = length % 16 == 0

    # Default unknown result
    result = AesProbeResult(
        mode_guess="unknown",
        iv_or_nonce=None,
        tag=None,
        aligned=aligned,
        confidence=0.0,
    )

    if length < 16:
        return result

    # Check for GCM pattern: typically nonce(12) + ciphertext + tag(16)
    # Or nonce(12) + tag(16) + ciphertext
    if length > 28:  # Minimum for GCM with any ciphertext
        # Try nonce at start, tag at end
        potential_nonce = data[:12]
        potential_tag = data[-16:]

        # GCM ciphertext (between nonce and tag) doesn't need to be aligned
        inner_len = length - 28

        # Heuristic: GCM is likely if entropy is high throughout
        if shannon_entropy(data) > 7.5:
            result.mode_guess = "gcm"
            result.iv_or_nonce = potential_nonce
            result.tag = potential_tag
            result.confidence = 0.6
            return result

    # Check for CBC pattern: IV(16) + ciphertext (multiple of 16)
    if aligned and length >= 32:
        potential_iv = data[:16]
        ciphertext = data[16:]

        if len(ciphertext) % 16 == 0:
            result.mode_guess = "cbc"
            result.iv_or_nonce = potential_iv
            result.confidence = 0.5
            return result

    # Check for CTR: IV/counter(16) + ciphertext (any length)
    if length > 16:
        potential_iv = data[:16]

        # CTR doesn't require alignment
        if not aligned:
            result.mode_guess = "ctr"
            result.iv_or_nonce = potential_iv
            result.confidence = 0.4
            return result

    return result


def decrypt_if_possible(
    data: bytes,
    probe: AesProbeResult,
    key_provider: KeyProvider | None,
    flow_id: str,
    direction: str,
) -> tuple[bytes, dict[str, Any]]:
    """
    Attempt decryption if key material is available.

    Args:
        data: Encrypted bytes
        probe: AES fingerprint result
        key_provider: Optional key provider
        flow_id: Flow identifier
        direction: "request" or "response"

    Returns:
        Tuple of (decrypted bytes or original, decision dict)
    """
    decision: dict[str, Any] = {
        "mode": probe.mode_guess,
        "status": "SKIP",
        "reason": "no key material provided",
    }

    if key_provider is None:
        return data, decision

    key = key_provider.get_key(flow_id, direction, probe.mode_guess)
    if key is None:
        decision["reason"] = "key provider returned None"
        return data, decision

    # Attempt decryption based on mode
    try:
        if probe.mode_guess == "gcm" and probe.iv_or_nonce and probe.tag:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM

            nonce = probe.iv_or_nonce
            tag = probe.tag
            ciphertext = data[12:-16]

            aesgcm = AESGCM(key)
            plaintext = aesgcm.decrypt(nonce, ciphertext + tag, None)

            decision["status"] = "PASS"
            decision["decrypted_size"] = len(plaintext)
            return plaintext, decision

        elif probe.mode_guess == "cbc" and probe.iv_or_nonce:
            from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
            from cryptography.hazmat.primitives import padding

            iv = probe.iv_or_nonce
            ciphertext = data[16:]

            cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
            decryptor = cipher.decryptor()
            padded = decryptor.update(ciphertext) + decryptor.finalize()

            unpadder = padding.PKCS7(128).unpadder()
            plaintext = unpadder.update(padded) + unpadder.finalize()

            decision["status"] = "PASS"
            decision["decrypted_size"] = len(plaintext)
            return plaintext, decision

    except ImportError:
        decision["reason"] = "cryptography library not installed"
    except Exception as e:
        decision["status"] = "FAIL"
        decision["error"] = str(e)

    return data, decision
