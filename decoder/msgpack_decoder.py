from __future__ import annotations
from dataclasses import dataclass
from typing import Any

@dataclass
class MsgpackResult:
    success: bool
    value: Any = None
    error: str | None = None
    bytes_consumed: int = 0

def is_msgpack(data: bytes) -> bool:
    if not data:
        return False
    b = data[0]
    return (0x80 <= b <= 0xbf or b in (0xc0, 0xc2, 0xc3) or
            0xc4 <= b <= 0xcb or 0xd0 <= b <= 0xd3 or
            b in (0xdc, 0xdd, 0xde, 0xdf))

def decode_msgpack(data: bytes) -> MsgpackResult:
    try:
        import msgpack
        value = msgpack.unpackb(data, raw=False, strict_map_key=False)
        return MsgpackResult(success=True, value=value, bytes_consumed=len(data))
    except ImportError:
        pass
    except Exception as exc:
        return MsgpackResult(success=False, error=f"msgpack: {exc}")
    b = data[0] if data else 0
    return MsgpackResult(success=True, value={"_type": _type_name(b), "_raw": f"0x{b:02x}", "_size": len(data)}, bytes_consumed=1)

def _type_name(b: int) -> str:
    if 0x80 <= b <= 0x8f: return f"fixmap({b & 0x0f})"
    if 0x90 <= b <= 0x9f: return f"fixarray({b & 0x0f})"
    if 0xa0 <= b <= 0xbf: return f"fixstr({b & 0x1f})"
    names = {0xc0:"nil",0xc2:"false",0xc3:"true",0xca:"float32",0xcb:"float64",
             0xcc:"uint8",0xcd:"uint16",0xce:"uint32",0xcf:"uint64",
             0xd0:"int8",0xd1:"int16",0xd2:"int32",0xd3:"int64",
             0xdc:"array16",0xdd:"array32",0xde:"map16",0xdf:"map32"}
    return names.get(b, f"unknown(0x{b:02x})")
