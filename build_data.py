import json
import re
from pathlib import Path
from pypdf import PdfReader

ROOT = Path('/Users/maxizosimov/Desktop/тренажер по англу')
PDFS = {
    'translation': Path('/Users/maxizosimov/Downloads/Термины_перевод (1).pdf'),
    'definitions': Path('/Users/maxizosimov/Downloads/Термины_определения (1).pdf'),
    'abbreviations': Path('/Users/maxizosimov/Downloads/Термины_ аббревиатуры (1).pdf'),
}


def extract_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def clean_text(value: str) -> str:
    value = value.replace("\n", " ")
    value = value.replace("  ", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip(" -\t")


def parse_translation(text: str):
    body_match = re.search(r"\n\s*1\.\s", text)
    body = text[body_match.start():] if body_match else text
    pattern = re.compile(r"(?ms)^\s*(\d+)\.\s*(.+?)\s*[–—-]\s*(.+?)(?=^\s*\d+\.\s*|\Z)")
    items = []
    for m in pattern.finditer(body):
        idx = int(m.group(1))
        en = clean_text(m.group(2))
        ru = clean_text(m.group(3))
        if not en or not ru:
            continue
        items.append({"id": idx, "en": en, "ru": ru})
    return items


def parse_abbreviations(text: str):
    pattern = re.compile(r"(?ms)^\s*(\d+)\.\s*(.+?)\s*[—–-]\s*(.+?)(?=^\s*\d+\.\s*|\Z)")
    items = []
    for m in pattern.finditer(text):
        idx = int(m.group(1))
        abbr = clean_text(m.group(2))
        expansion = clean_text(m.group(3))
        if not abbr or not expansion:
            continue
        items.append({"id": idx, "abbr": abbr, "expansion": expansion})
    return items


def is_term_start(line: str) -> bool:
    line = line.strip()
    if not line:
        return False
    if " is " not in line:
        return False
    if not re.match(r"^[A-Z]", line):
        return False
    if line.startswith("The first-generation computers"):
        return True
    if line.startswith("The second-generation computers"):
        return True
    if line.startswith("The third-generation computers"):
        return True
    if line.startswith("The fourth-generation computers"):
        return True
    if line.startswith("The fifth-generation computers"):
        return True
    return True


def normalize_term(term: str) -> str:
    term = term.strip().rstrip(',;:.')
    term = re.sub(r"\s+", " ", term)
    term = re.sub(r"^The\s+", "", term)
    term = re.sub(r",\s*often referred to as.*$", "", term, flags=re.IGNORECASE)
    term = term.rstrip(',;:. ')
    return term


def parse_definitions(text: str):
    lines = text.splitlines()
    entries = []
    current = None

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if is_term_start(line):
            if current:
                entries.append(current)
            current = line
        else:
            if current:
                current += " " + line

    if current:
        entries.append(current)

    parsed = []
    for entry in entries:
        if " is " not in entry:
            continue
        term, definition = entry.split(" is ", 1)
        term = normalize_term(clean_text(term))
        definition = clean_text(definition)
        if not term or not definition:
            continue
        parsed.append({"term": term, "definition": definition})

    dedup = {}
    for item in parsed:
        key = item["term"].lower()
        old = dedup.get(key)
        if old is None or len(item["definition"]) > len(old["definition"]):
            dedup[key] = item

    return sorted(dedup.values(), key=lambda x: x["term"].lower())


def main():
    translation_text = extract_text(PDFS['translation'])
    definitions_text = extract_text(PDFS['definitions'])
    abbreviations_text = extract_text(PDFS['abbreviations'])

    data = {
        "translation": parse_translation(translation_text),
        "abbreviations": parse_abbreviations(abbreviations_text),
        "definitions": parse_definitions(definitions_text),
    }

    out = "window.TRAINER_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    (ROOT / 'data.js').write_text(out, encoding='utf-8')

    print('translation:', len(data['translation']))
    print('abbreviations:', len(data['abbreviations']))
    print('definitions:', len(data['definitions']))


if __name__ == '__main__':
    main()
