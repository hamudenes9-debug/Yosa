#!/usr/bin/env python3
"""Pure-Python 4-byte ZIP aligner (equivalent to Android SDK `zipalign 4 in.apk out.apk`)."""
import struct
import sys
import zipfile


def zipalign(in_path: str, out_path: str, alignment: int = 4) -> None:
    entries = []
    with zipfile.ZipFile(in_path, "r") as zin:
        for info in zin.infolist():
            raw_bytes = zin.read(info.filename)
            entries.append((info, raw_bytes))

    out = bytearray()
    central_dir = bytearray()

    for info, payload in entries:
        fn_bytes = info.filename.encode("utf-8")
        is_stored = info.compress_type == zipfile.ZIP_STORED

        if is_stored:
            compressed_data = payload
            crc = zipfile.crc32(payload) & 0xFFFFFFFF
            comp_size = len(payload)
            uncomp_size = len(payload)
            # Calculate padding needed in local header extra field so data starts at multiple of `alignment`
            base_end = len(out) + 30 + len(fn_bytes)
            pad_len = (alignment - (base_end % alignment)) % alignment
            extra = b"\x00" * pad_len
        else:
            comp = zipfile.zlib.compressobj(6, zipfile.zlib.DEFLATED, -15)
            compressed_data = comp.compress(payload) + comp.flush()
            crc = zipfile.crc32(payload) & 0xFFFFFFFF
            comp_size = len(compressed_data)
            uncomp_size = len(payload)
            extra = b""

        local_header_offset = len(out)
        dos_date = ((info.date_time[0] - 1980) << 9) | (info.date_time[1] << 5) | info.date_time[2]
        dos_time = (info.date_time[3] << 11) | (info.date_time[4] << 5) | (info.date_time[5] // 2)
        extract_ver = 20
        flags = 0x0800  # UTF-8 filename

        local_hdr = struct.pack(
            "<4sHHHHHIIIHH",
            b"PK\x03\x04",
            extract_ver,
            flags,
            info.compress_type,
            dos_time,
            dos_date,
            crc,
            comp_size,
            uncomp_size,
            len(fn_bytes),
            len(extra),
        )
        out.extend(local_hdr)
        out.extend(fn_bytes)
        out.extend(extra)

        if is_stored:
            assert len(out) % alignment == 0, f"Unaligned entry {info.filename}"

        out.extend(compressed_data)

        cd_hdr = struct.pack(
            "<4sHHHHHHIIIHHHHHII",
            b"PK\x01\x02",
            20,
            extract_ver,
            flags,
            info.compress_type,
            dos_time,
            dos_date,
            crc,
            comp_size,
            uncomp_size,
            len(fn_bytes),
            0,  # central dir extra len
            0,  # comment len
            0,  # disk num
            0,  # internal attr
            info.external_attr,
            local_header_offset,
        )
        central_dir.extend(cd_hdr)
        central_dir.extend(fn_bytes)

    cd_offset = len(out)
    cd_size = len(central_dir)
    out.extend(central_dir)

    eocd = struct.pack(
        "<4sHHHHIIH",
        b"PK\x05\x06",
        0,
        0,
        len(entries),
        len(entries),
        cd_size,
        cd_offset,
        0,
    )
    out.extend(eocd)

    with open(out_path, "wb") as f:
        f.write(out)


if __name__ == "__main__":
    zipalign(sys.argv[1], sys.argv[2])
