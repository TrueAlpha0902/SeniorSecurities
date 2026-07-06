from __future__ import annotations

import json
import re
import shutil
import subprocess
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA_OUT = PUBLIC / "data" / "pdf-image-quiz.json"
OCR_CACHE = ROOT / "tmp" / "ocr"
MARKER_OCR_CACHE = ROOT / "tmp" / "ocr-marker"
EXPLANATION_OCR_CACHE = ROOT / "tmp" / "ocr-explanation"
PDF_SOURCE_DIR = Path.home() / "Downloads"
DERIVED_OCR_CACHE_VERSION = "v4"

BODY_TOP = 140
BODY_BOTTOM = 1688
CROP_X = 60
CROP_RIGHT = 1220
QUESTION_NUMBER_OFFSET = 36
SEGMENT_PAD_TOP = 16
SEGMENT_PAD_BOTTOM = 56
SEGMENT_SAFE_TOP_PAD = 0
SEGMENT_SAFE_BOTTOM_PAD = 22
PAGE_BREAK_BOTTOM_PAD = 18
QUESTION_X_PAD = 3
IMAGE_EXT = "webp"
PDF_RENDER_DPI = 150
ANSWER_TO_NUMBER = {"A": "1", "B": "2", "C": "3", "D": "4"}
OCR_ENGINE: RapidOCR | None = None


def get_ocr_engine() -> RapidOCR:
    global OCR_ENGINE
    if OCR_ENGINE is None:
        print("Loading OCR engine...", flush=True)
        OCR_ENGINE = RapidOCR()
    return OCR_ENGINE


CHAPTERS = [
    {
        "bankId": "investment",
        "bankTitle": "\u6295\u8cc7\u5b78",
        "chapterId": "\u7b2c\u4e00\u7ae0",
        "chapterSlug": "ch01",
        "sourceFile": "\u6295\u8cc7\u5b78-\u7b2c\u4e00\u7ae0.pdf",
        "expectedQuestions": 128,
        "answerReport": ROOT / "staging" / "batch-001" / "reports" / "\u6295\u8cc7\u5b78-\u7b2c\u4e00\u7ae0.pdf-answers.json",
        "answerReportScale": 0.75,
        "manualExplanations": {
            111: {"page": 25, "y": 1260},
        },
    },
    {
        "bankId": "investment",
        "bankTitle": "\u6295\u8cc7\u5b78",
        "chapterId": "\u7b2c\u4e8c\u7ae0",
        "chapterSlug": "ch02",
        "sourceFile": "\u6295\u8cc7\u5b78-\u7b2c\u4e8c\u7ae0.pdf",
        "expectedQuestions": 189,
        "manualExplanations": {
            86: {"page": 18, "y": 1364},
        },
        "manualStarts": {
            23: {"page": 5, "y": 1408, "x": 96, "answer": "2"},
            24: {"page": 6, "y": 222, "x": 100, "answer": "1"},
            33: {"page": 8, "y": 370, "x": 112, "answer": "4"},
            46: {"page": 10, "y": 1084, "x": 98, "answer": "2"},
            62: {"page": 14, "y": 180, "x": 100, "answer": "2"},
            68: {"page": 15, "y": 612, "x": 96, "answer": "2"},
            85: {"page": 18, "y": 1006, "x": 100, "answer": "3"},
            96: {"page": 20, "y": 1340, "x": 102, "answer": "4"},
            99: {"page": 21, "y": 618, "x": 98, "answer": "2"},
            108: {"page": 22, "y": 1508, "x": 102, "answer": "3"},
            114: {"page": 24, "y": 496, "x": 100, "answer": "1"},
            121: {"page": 25, "y": 1018, "x": 112, "answer": "1"},
            123: {"page": 26, "y": 180, "x": 100, "answer": "1"},
            127: {"page": 26, "y": 1248, "x": 112, "answer": "3"},
            128: {"page": 26, "y": 1504, "x": 100, "answer": "2"},
            130: {"page": 27, "y": 596, "x": 100, "answer": "4"},
            142: {"page": 29, "y": 1288, "x": 112, "answer": "2"},
            143: {"page": 30, "y": 180, "x": 100, "answer": "2"},
            153: {"page": 31, "y": 1588, "x": 96, "answer": "2"},
            158: {"page": 32, "y": 1346, "x": 100, "answer": "1"},
            162: {"page": 33, "y": 1409, "x": 111, "answer": "1"},
            173: {"page": 36, "y": 180, "x": 100, "answer": "1"},
            175: {"page": 36, "y": 520, "x": 100, "answer": "4"},
            182: {"page": 37, "y": 894, "x": 96, "answer": "4"},
        },
    },
    {
        "bankId": "investment",
        "bankTitle": "\u6295\u8cc7\u5b78",
        "chapterId": "\u7b2c\u4e09\u7ae0",
        "chapterSlug": "ch03",
        "sourceFile": "\u6295\u8cc7\u5b78-\u7b2c\u4e09\u7ae0.pdf",
        "expectedQuestions": 60,
        "manualExplanations": {
            27: {"page": 6, "y": 1501},
            28: {"page": 7, "y": 218},
        },
        "manualStarts": {
            3: {"page": 1, "y": 907, "x": 113, "answer": "3"},
            8: {"page": 3, "y": 497, "x": 112, "answer": "1"},
            14: {"page": 4, "y": 452, "x": 92, "answer": "4"},
            31: {"page": 7, "y": 907, "x": 90, "answer": "3"},
            33: {"page": 8, "y": 180, "x": 90, "answer": "4"},
            50: {"page": 11, "y": 953, "x": 90, "answer": "3"},
        },
    },
    {
        "bankId": "investment",
        "bankTitle": "\u6295\u8cc7\u5b78",
        "chapterId": "\u7b2c\u56db\u7ae0",
        "chapterSlug": "ch04",
        "sourceFile": "\u6295\u8cc7\u5b78-\u7b2c\u56db\u7ae0.pdf",
        "expectedQuestions": 162,
        "manualExplanations": {
            61: {"page": 14, "y": 398},
        },
        "manualStarts": {
            5: {"page": 2, "y": 452, "x": 112, "answer": "4"},
            19: {"page": 5, "y": 1004, "x": 112, "answer": "3"},
            25: {"page": 6, "y": 1545, "x": 112, "answer": "1"},
            26: {"page": 7, "y": 254, "x": 112, "answer": "4"},
            27: {"page": 7, "y": 727, "x": 115, "answer": "2"},
            39: {"page": 9, "y": 949, "x": 118, "answer": "4"},
            40: {"page": 9, "y": 1346, "x": 121, "answer": "1"},
            42: {"page": 10, "y": 526, "x": 112, "answer": "1"},
            46: {"page": 10, "y": 1580, "x": 112, "answer": "1"},
            57: {"page": 13, "y": 512, "x": 127, "answer": "3"},
            59: {"page": 13, "y": 1059, "x": 122, "answer": "2"},
            62: {"page": 14, "y": 453, "x": 180, "answer": "4"},
            63: {"page": 14, "y": 714, "x": 179, "answer": "1"},
            69: {"page": 15, "y": 881, "x": 110, "answer": "3"},
            70: {"page": 15, "y": 1130, "x": 110, "answer": "1"},
            72: {"page": 16, "y": 309, "x": 112, "answer": "1"},
            73: {"page": 16, "y": 660, "x": 180, "answer": "4"},
            75: {"page": 16, "y": 1290, "x": 178, "answer": "4"},
            78: {"page": 17, "y": 670, "x": 118, "answer": "3"},
            88: {"page": 18, "y": 1594, "x": 179, "answer": "4"},
            90: {"page": 19, "y": 620, "x": 112, "answer": "3"},
            92: {"page": 19, "y": 1084, "x": 122, "answer": "2"},
            94: {"page": 19, "y": 1533, "x": 120, "answer": "1"},
            96: {"page": 20, "y": 735, "x": 112, "answer": "1"},
            111: {"page": 22, "y": 1233, "x": 112, "answer": "3"},
            115: {"page": 23, "y": 719, "x": 134, "answer": "3"},
            116: {"page": 23, "y": 833, "x": 132, "answer": "3"},
            119: {"page": 23, "y": 1480, "x": 133, "answer": "3"},
            120: {"page": 24, "y": 237, "x": 192, "answer": "4"},
            121: {"page": 24, "y": 500, "x": 187, "answer": "4"},
            127: {"page": 25, "y": 529, "x": 150, "answer": "3"},
            134: {"page": 26, "y": 540, "x": 175, "answer": "3"},
            137: {"page": 26, "y": 1043, "x": 173, "answer": "4"},
            149: {"page": 29, "y": 372, "x": 151, "answer": "2"},
            154: {"page": 29, "y": 1580, "x": 140, "answer": "4"},
            155: {"page": 30, "y": 380, "x": 168, "answer": "2"},
            160: {"page": 31, "y": 326, "x": 112, "answer": "2"},
        },
    },
    {
        "bankId": "investment",
        "bankTitle": "\u6295\u8cc7\u5b78",
        "chapterId": "\u7b2c\u4e94\u7ae0",
        "chapterSlug": "ch05",
        "sourceFile": "\u6295\u8cc7\u5b78-\u7b2c\u4e94\u7ae0.pdf",
        "expectedQuestions": 154,
        "manualExplanations": {
            28: {"page": 5, "y": 1562},
            48: {"page": 9, "y": 718},
            87: {"page": 16, "y": 212},
        },
        "manualStarts": {
            15: {"page": 3, "y": 1155, "x": 176, "answer": "1"},
            24: {"page": 5, "y": 563, "x": 170, "answer": "1"},
            26: {"page": 5, "y": 949, "x": 172, "answer": "3"},
            34: {"page": 6, "y": 1288, "x": 125, "answer": "4"},
            40: {"page": 7, "y": 1536, "x": 173, "answer": "3"},
            46: {"page": 8, "y": 1508, "x": 122, "answer": "1"},
            58: {"page": 10, "y": 1525, "x": 114, "answer": "4"},
            98: {"page": 18, "y": 232, "x": 152, "answer": "3"},
            137: {"page": 25, "y": 620, "x": 181, "answer": "3"},
            138: {"page": 25, "y": 847, "x": 182, "answer": "1"},
            146: {"page": 27, "y": 153, "x": 184, "answer": "2"},
        },
    },
    {
        "bankId": "investment",
        "bankTitle": "\u6295\u8cc7\u5b78",
        "chapterId": "\u7b2c\u516d\u7ae0",
        "chapterSlug": "ch06",
        "sourceFile": "\u6295\u8cc7\u5b78-\u7b2c\u516d\u7ae0.pdf",
        "expectedQuestions": 98,
        "manualExplanations": {
            9: {"page": 2, "y": 1605},
        },
        "manualStarts": {
            2: {"page": 1, "y": 743, "x": 183, "answer": "1"},
            4: {"page": 1, "y": 1296, "x": 177, "answer": "2"},
            10: {"page": 3, "y": 158, "x": 170, "answer": "2"},
            20: {"page": 5, "y": 596, "x": 118, "answer": "1"},
            22: {"page": 5, "y": 1240, "x": 118, "answer": "2"},
            23: {"page": 5, "y": 1515, "x": 118, "answer": "4"},
            29: {"page": 7, "y": 168, "x": 134, "answer": "1"},
            39: {"page": 9, "y": 267, "x": 171, "answer": "4"},
            40: {"page": 9, "y": 579, "x": 167, "answer": "2"},
            42: {"page": 9, "y": 1020, "x": 165, "answer": "3"},
            44: {"page": 10, "y": 234, "x": 128, "answer": "4"},
            45: {"page": 10, "y": 503, "x": 129, "answer": "4"},
            46: {"page": 10, "y": 816, "x": 130, "answer": "1"},
            47: {"page": 10, "y": 1403, "x": 130, "answer": "3"},
            53: {"page": 12, "y": 255, "x": 112, "answer": "3"},
            57: {"page": 13, "y": 394, "x": 148, "answer": "4"},
            64: {"page": 14, "y": 994, "x": 126, "answer": "3"},
            72: {"page": 16, "y": 497, "x": 129, "answer": "3"},
            78: {"page": 17, "y": 846, "x": 138, "answer": "3"},
            80: {"page": 17, "y": 1375, "x": 134, "answer": "3"},
            92: {"page": 20, "y": 555, "x": 132, "answer": "3"},
        },
    },
    {
        "bankId": "investment",
        "bankTitle": "\u6295\u8cc7\u5b78",
        "chapterId": "\u7b2c\u4e03\u7ae0",
        "chapterSlug": "ch07",
        "sourceFile": "\u6295\u8cc7\u5b78-\u7b2c\u4e03\u7ae0.pdf",
        "expectedQuestions": 125,
        "manualExplanations": {
            105: {"page": 24, "y": 650},
        },
        "manualStarts": {
            2: {"page": 1, "y": 630, "x": 169, "answer": "1"},
            9: {"page": 3, "y": 146, "x": 173, "answer": "4"},
            16: {"page": 4, "y": 590, "x": 145, "answer": "2"},
            17: {"page": 4, "y": 990, "x": 145, "answer": "1"},
            26: {"page": 6, "y": 565, "x": 124, "answer": "2"},
            30: {"page": 7, "y": 140, "x": 151, "answer": "4"},
            31: {"page": 7, "y": 500, "x": 145, "answer": "4"},
            33: {"page": 7, "y": 1260, "x": 145, "answer": "3"},
            39: {"page": 9, "y": 427, "x": 163, "answer": "1"},
            41: {"page": 9, "y": 1179, "x": 160, "answer": "3"},
            53: {"page": 12, "y": 444, "x": 110, "answer": "1"},
            58: {"page": 13, "y": 255, "x": 161, "answer": "3"},
            76: {"page": 17, "y": 144, "x": 165, "answer": "2"},
            87: {"page": 19, "y": 1479, "x": 150, "answer": "1"},
            91: {"page": 21, "y": 142, "x": 153, "answer": "1"},
            101: {"page": 23, "y": 675, "x": 145, "answer": "3"},
            109: {"page": 25, "y": 140, "x": 162, "answer": "1"},
            118: {"page": 27, "y": 140, "x": 154, "answer": "3"},
            124: {"page": 28, "y": 741, "x": 123, "answer": "3"},
        },
    },
    {
        "bankId": "investment",
        "bankTitle": "\u6295\u8cc7\u5b78",
        "chapterId": "\u7b2c\u516b\u7ae0",
        "chapterSlug": "ch08",
        "sourceFile": "\u6295\u8cc7\u5b78-\u7b2c\u516b\u7ae0.pdf",
        "expectedQuestions": 120,
        "manualExplanations": {
            114: {"page": 21, "y": 1179},
        },
        "manualStarts": {
            3: {"page": 1, "y": 890, "x": 129, "answer": "4"},
            7: {"page": 2, "y": 296, "x": 145, "answer": "4"},
            8: {"page": 2, "y": 461, "x": 143, "answer": "3"},
            19: {"page": 4, "y": 337, "x": 138, "answer": "2"},
            37: {"page": 7, "y": 534, "x": 103, "answer": "1"},
            57: {"page": 11, "y": 381, "x": 114, "answer": "4"},
            58: {"page": 11, "y": 584, "x": 111, "answer": "3"},
            67: {"page": 12, "y": 1267, "x": 133, "answer": "3"},
            107: {"page": 20, "y": 257, "x": 131, "answer": "2"},
        },
    },
    {
        "bankId": "investment",
        "bankTitle": "\u6295\u8cc7\u5b78",
        "chapterId": "\u7b2c\u4e5d\u7ae0",
        "chapterSlug": "ch09",
        "sourceFile": "\u6295\u8cc7\u5b78-\u7b2c\u4e5d\u7ae0.pdf",
        "expectedQuestions": 74,
        "manualStarts": {
            19: {"page": 4, "y": 1517, "x": 135, "answer": "2"},
            32: {"page": 7, "y": 1068, "x": 123, "answer": "2"},
            43: {"page": 10, "y": 382, "x": 139, "answer": "3"},
            45: {"page": 10, "y": 950, "x": 135, "answer": "4"},
            46: {"page": 11, "y": 215, "x": 128, "answer": "2"},
            49: {"page": 11, "y": 908, "x": 124, "answer": "4"},
            60: {"page": 14, "y": 196, "x": 120, "answer": "4"},
            69: {"page": 15, "y": 1315, "x": 116, "answer": "1"},
        },
    },
    {
        "bankId": "financial-analysis",
        "bankTitle": "\u8ca1\u52d9\u5206\u6790",
        "chapterId": "\u7b2c\u4e00\u7ae0",
        "chapterSlug": "ch01",
        "sourceFile": "\u8ca1\u52d9\u5206\u6790-\u7b2c\u4e00\u7ae0.pdf",
        "expectedQuestions": 76,
        "ocrCacheDir": "financial-analysis/ch01",
        "manualStarts": {
            3: {"page": 1, "y": 1375, "x": 112, "answer": "2"},
            22: {"page": 6, "y": 902, "x": 178, "answer": "3"},
            27: {"page": 7, "y": 1395, "x": 104, "answer": "4"},
            29: {"page": 8, "y": 547, "x": 160, "answer": "2"},
            34: {"page": 9, "y": 454, "x": 102, "answer": "4"},
            39: {"page": 10, "y": 695, "x": 168, "answer": "4"},
            54: {"page": 13, "y": 1040, "x": 99, "answer": "4"},
            57: {"page": 14, "y": 409, "x": 154, "answer": "2"},
            68: {"page": 16, "y": 1400, "x": 176, "answer": "1"},
            71: {"page": 17, "y": 1010, "x": 107, "answer": "2"},
            74: {"page": 18, "y": 555, "x": 161, "answer": "1"},
        },
        "manualAnchors": {
            22: {"x": 205, "y": 902},
            68: {"x": 205, "y": 1400},
        },
    },
    {
        "bankId": "financial-analysis",
        "bankTitle": "\u8ca1\u52d9\u5206\u6790",
        "chapterId": "\u7b2c\u4e8c\u7ae0",
        "chapterSlug": "ch02",
        "sourceFile": "\u8ca1\u52d9\u5206\u6790-\u7b2c\u4e8c\u7ae0.pdf",
        "expectedQuestions": 84,
        "ocrCacheDir": "financial-analysis/ch02",
        "manualStarts": {
            8: {"page": 2, "y": 1485, "x": 104, "answer": "4"},
            12: {"page": 3, "y": 1392, "x": 166, "answer": "4"},
            14: {"page": 4, "y": 408, "x": 115, "answer": "3"},
            16: {"page": 4, "y": 928, "x": 115, "answer": "3"},
            18: {"page": 5, "y": 174, "x": 166, "answer": "1"},
            23: {"page": 6, "y": 203, "x": 117, "answer": "3"},
            28: {"page": 7, "y": 184, "x": 166, "answer": "3"},
            31: {"page": 7, "y": 1116, "x": 166, "answer": "1"},
            43: {"page": 10, "y": 980, "x": 113, "answer": "3"},
            47: {"page": 11, "y": 900, "x": 146, "answer": "2"},
            50: {"page": 12, "y": 170, "x": 123, "answer": "3"},
            58: {"page": 14, "y": 464, "x": 127, "answer": "4"},
            75: {"page": 18, "y": 915, "x": 125, "answer": "4"},
            83: {"page": 20, "y": 610, "x": 126, "answer": "4"},
        },
    },
    {
        "bankId": "financial-analysis",
        "bankTitle": "\u8ca1\u52d9\u5206\u6790",
        "chapterId": "\u7b2c\u4e09\u7ae0",
        "chapterSlug": "ch03",
        "sourceFile": "\u8ca1\u52d9\u5206\u6790-\u7b2c\u4e09\u7ae0.pdf",
        "expectedQuestions": 79,
        "ocrCacheDir": "financial-analysis/ch03",
        "manualExplanations": {
            5: {"page": 2, "y": 252},
        },
        "manualQuestionSegmentBottoms": {
            9: {2: 1675},
            54: {12: 1675},
        },
        "manualStarts": {
            2: {"page": 1, "y": 674, "x": 129, "answer": "2"},
            10: {"page": 3, "y": 482, "x": 108, "answer": "1"},
            15: {"page": 4, "y": 390, "x": 152, "answer": "1"},
            18: {"page": 4, "y": 1372, "x": 152, "answer": "4"},
            39: {"page": 9, "y": 700, "x": 135, "answer": "4"},
            54: {"page": 12, "y": 1545, "x": 130, "answer": "3"},
            73: {"page": 16, "y": 1365, "x": 125, "answer": "1"},
        },
    },
    {
        "bankId": "financial-analysis",
        "bankTitle": "\u8ca1\u52d9\u5206\u6790",
        "chapterId": "\u7b2c\u56db\u7ae0",
        "chapterSlug": "ch04",
        "sourceFile": "\u8ca1\u52d9\u5206\u6790-\u7b2c\u56db\u7ae0.pdf",
        "expectedQuestions": 118,
        "ocrCacheDir": "financial-analysis/ch04",
        "manualStarts": {
            7: {"page": 2, "y": 417, "x": 145, "answer": "2"},
            18: {"page": 4, "y": 900, "x": 138, "answer": "2"},
            23: {"page": 5, "y": 818, "x": 153, "answer": "4"},
            32: {"page": 7, "y": 590, "x": 146, "answer": "1"},
            38: {"page": 8, "y": 484, "x": 132, "answer": "1"},
            43: {"page": 9, "y": 520, "x": 140, "answer": "1"},
            50: {"page": 10, "y": 1120, "x": 135, "answer": "4"},
            53: {"page": 11, "y": 605, "x": 146, "answer": "4"},
            89: {"page": 18, "y": 530, "x": 129, "answer": "1"},
            91: {"page": 18, "y": 1250, "x": 129, "answer": "2"},
            93: {"page": 19, "y": 430, "x": 154, "answer": "4"},
            96: {"page": 20, "y": 160, "x": 113, "answer": "3"},
            101: {"page": 21, "y": 493, "x": 162, "answer": "3"},
            107: {"page": 22, "y": 900, "x": 134, "answer": "2"},
            109: {"page": 23, "y": 336, "x": 170, "answer": "2"},
            114: {"page": 24, "y": 675, "x": 133, "answer": "3"},
        },
    },
    {
        "bankId": "financial-analysis",
        "bankTitle": "\u8ca1\u52d9\u5206\u6790",
        "chapterId": "\u7b2c\u4e94\u7ae0",
        "chapterSlug": "ch05",
        "sourceFile": "\u8ca1\u52d9\u5206\u6790-\u7b2c\u4e94\u7ae0.pdf",
        "expectedQuestions": 61,
        "ocrCacheDir": "financial-analysis/ch05",
        "manualExplanations": {
            57: {"page": 13, "y": 194},
        },
        "manualStarts": {
            2: {"page": 1, "y": 662, "x": 204, "answer": "4"},
            4: {"page": 1, "y": 1400, "x": 204, "answer": "1"},
            9: {"page": 2, "y": 1498, "x": 92, "answer": "3"},
            23: {"page": 5, "y": 891, "x": 164, "answer": "2"},
            50: {"page": 11, "y": 1040, "x": 145, "answer": "1"},
        },
    },
    {
        "bankId": "financial-analysis",
        "bankTitle": "\u8ca1\u52d9\u5206\u6790",
        "chapterId": "\u7b2c\u516d\u7ae0",
        "chapterSlug": "ch06",
        "sourceFile": "\u8ca1\u52d9\u5206\u6790-\u7b2c\u516d\u7ae0.pdf",
        "expectedQuestions": 54,
        "ocrCacheDir": "financial-analysis/ch06",
        "manualStarts": {
            2: {"page": 1, "y": 700, "x": 116, "answer": "4"},
            9: {"page": 2, "y": 1355, "x": 92, "answer": "1"},
            11: {"page": 3, "y": 545, "x": 101, "answer": "3"},
            14: {"page": 3, "y": 1345, "x": 100, "answer": "2"},
            20: {"page": 5, "y": 327, "x": 106, "answer": "2"},
            23: {"page": 5, "y": 1325, "x": 100, "answer": "4"},
            30: {"page": 7, "y": 330, "x": 112, "answer": "4"},
            37: {"page": 8, "y": 896, "x": 148, "answer": "4"},
            42: {"page": 9, "y": 930, "x": 120, "answer": "4"},
            48: {"page": 10, "y": 1050, "x": 140, "answer": "1"},
            50: {"page": 10, "y": 1530, "x": 140, "answer": "2"},
            51: {"page": 11, "y": 470, "x": 96, "answer": "2"},
            53: {"page": 11, "y": 1140, "x": 96, "answer": "2"},
        },
    },
    {
        "bankId": "financial-analysis",
        "bankTitle": "\u8ca1\u52d9\u5206\u6790",
        "chapterId": "\u7b2c\u4e03\u7ae0",
        "chapterSlug": "ch07",
        "sourceFile": "\u8ca1\u52d9\u5206\u6790-\u7b2c\u4e03\u7ae0.pdf",
        "expectedQuestions": 149,
        "ocrCacheDir": "financial-analysis/ch07",
        "disableVisualStarts": True,
        "manualStarts": {
            1: {"page": 1, "y": 407, "x": 132, "answer": "2"},
            5: {"page": 2, "y": 179, "x": 145, "answer": "2"},
            34: {"page": 8, "y": 317, "x": 136, "answer": "1"},
            48: {"page": 10, "y": 1264, "x": 175, "answer": "2"},
            50: {"page": 11, "y": 577, "x": 119, "answer": "4"},
            83: {"page": 17, "y": 183, "x": 114, "answer": "4"},
            94: {"page": 19, "y": 476, "x": 132, "answer": "3"},
            110: {"page": 22, "y": 570, "x": 138, "answer": "2"},
            123: {"page": 24, "y": 1525, "x": 165, "answer": "4"},
            126: {"page": 25, "y": 953, "x": 141, "answer": "4"},
            138: {"page": 28, "y": 185, "x": 138, "answer": "1"},
            143: {"page": 28, "y": 1327, "x": 139, "answer": "2"},
            146: {"page": 29, "y": 806, "x": 114, "answer": "1"},
        },
    },
    {
        "bankId": "financial-analysis",
        "bankTitle": "\u8ca1\u52d9\u5206\u6790",
        "chapterId": "\u7b2c\u516b\u7ae0",
        "chapterSlug": "ch08",
        "sourceFile": "\u8ca1\u52d9\u5206\u6790-\u7b2c\u516b\u7ae0.pdf",
        "expectedQuestions": 47,
        "ocrCacheDir": "financial-analysis/ch08",
        "manualStarts": {
            9: {"page": 3, "y": 300, "x": 139, "answer": "4"},
            47: {"page": 11, "y": 277, "x": 139, "answer": "1"},
        },
    },
    {
        "bankId": "financial-analysis",
        "bankTitle": "\u8ca1\u52d9\u5206\u6790",
        "chapterId": "\u7b2c\u4e5d\u7ae0",
        "chapterSlug": "ch09",
        "sourceFile": "\u8ca1\u52d9\u5206\u6790-\u7b2c\u4e5d\u7ae0.pdf",
        "expectedQuestions": 36,
        "ocrCacheDir": "financial-analysis/ch09",
        "manualStarts": {
            1: {"page": 1, "y": 455, "x": 123, "answer": "3"},
            8: {"page": 2, "y": 490, "x": 134, "answer": "4"},
            16: {"page": 3, "y": 1050, "x": 134, "answer": "4"},
            18: {"page": 4, "y": 350, "x": 124, "answer": "3"},
            20: {"page": 4, "y": 1105, "x": 123, "answer": "1"},
            23: {"page": 5, "y": 327, "x": 140, "answer": "4"},
            36: {"page": 7, "y": 1055, "x": 133, "answer": "3"},
        },
    },
    {
        "bankId": "financial-analysis",
        "bankTitle": "\u8ca1\u52d9\u5206\u6790",
        "chapterId": "\u7b2c\u5341\u7ae0",
        "chapterSlug": "ch10",
        "sourceFile": "\u8ca1\u52d9\u5206\u6790-\u7b2c\u5341\u7ae0.pdf",
        "expectedQuestions": 169,
        "ocrCacheDir": "financial-analysis/ch10",
        "manualStarts": {
            3: {"page": 1, "y": 975, "x": 162, "answer": "3"},
            14: {"page": 3, "y": 1570, "x": 132, "answer": "1"},
            28: {"page": 6, "y": 720, "x": 124, "answer": "2"},
            34: {"page": 7, "y": 880, "x": 122, "answer": "3"},
            44: {"page": 9, "y": 1445, "x": 137, "answer": "3"},
            51: {"page": 11, "y": 660, "x": 142, "answer": "2"},
            55: {"page": 12, "y": 330, "x": 123, "answer": "3"},
            57: {"page": 12, "y": 772, "x": 120, "answer": "1"},
            69: {"page": 14, "y": 1003, "x": 118, "answer": "1"},
            70: {"page": 14, "y": 1258, "x": 118, "answer": "2"},
            71: {"page": 14, "y": 1488, "x": 118, "answer": "1"},
            91: {"page": 18, "y": 540, "x": 106, "answer": "4"},
            97: {"page": 19, "y": 520, "x": 130, "answer": "1"},
            104: {"page": 20, "y": 1110, "x": 109, "answer": "2"},
            121: {"page": 23, "y": 1200, "x": 148, "answer": "4"},
            133: {"page": 25, "y": 1400, "x": 135, "answer": "3"},
            143: {"page": 27, "y": 1245, "x": 141, "answer": "2"},
            156: {"page": 29, "y": 1350, "x": 143, "answer": "4"},
            158: {"page": 30, "y": 370, "x": 119, "answer": "4"},
        },
        "manualAnchors": {
            97: {"x": 185, "y": 520},
        },
    },
    {
        "bankId": "financial-analysis",
        "bankTitle": "\u8ca1\u52d9\u5206\u6790",
        "chapterId": "\u7b2c\u5341\u4e00\u7ae0",
        "chapterSlug": "ch11",
        "sourceFile": "\u8ca1\u52d9\u5206\u6790-\u7b2c\u5341\u4e00\u7ae0.pdf",
        "expectedQuestions": 22,
        "ocrCacheDir": "financial-analysis/ch11",
        "manualStarts": {
            1: {"page": 1, "y": 450, "x": 134, "answer": "2"},
            2: {"page": 1, "y": 825, "x": 134, "answer": "2"},
            19: {"page": 5, "y": 675, "x": 135, "answer": "1"},
            20: {"page": 5, "y": 870, "x": 135, "answer": "2"},
        },
    },
]


CHAPTER_LABELS = [
    "\u7b2c\u4e00\u7ae0",
    "\u7b2c\u4e8c\u7ae0",
    "\u7b2c\u4e09\u7ae0",
    "\u7b2c\u56db\u7ae0",
    "\u7b2c\u4e94\u7ae0",
    "\u7b2c\u516d\u7ae0",
    "\u7b2c\u4e03\u7ae0",
    "\u7b2c\u516b\u7ae0",
    "\u7b2c\u4e5d\u7ae0",
    "\u7b2c\u5341\u7ae0",
    "\u7b2c\u5341\u4e00\u7ae0",
    "\u7b2c\u5341\u4e8c\u7ae0",
    "\u7b2c\u5341\u4e09\u7ae0",
]


def generated_pdf_chapters(bank_id: str, bank_title: str, count: int) -> list[dict[str, Any]]:
    return [
        {
            "bankId": bank_id,
            "bankTitle": bank_title,
            "chapterId": CHAPTER_LABELS[index],
            "chapterSlug": f"ch{index + 1:02d}",
            "sourceFile": f"{bank_title}-{CHAPTER_LABELS[index]}.pdf",
            "ocrCacheDir": f"{bank_id}/ch{index + 1:02d}",
        }
        for index in range(count)
    ]


CHAPTERS.extend(
    generated_pdf_chapters(
        "securities-trading-regulations",
        "\u8b49\u5238\u4ea4\u6613\u76f8\u95dc\u6cd5\u898f",
        7,
    )
)
CHAPTERS.extend(
    generated_pdf_chapters(
        "securities-trading-practice",
        "\u8b49\u5238\u4ea4\u6613\u76f8\u95dc\u5be6\u52d9",
        13,
    )
)


CHAPTER_OVERRIDES: dict[tuple[str, str], dict[str, Any]] = {
    ("securities-trading-regulations", "ch01"): {
        "expectedQuestions": 155,
        "manualStarts": {
            74: {"page": 19, "y": 430, "x": 150, "answer": "2"},
            142: {"page": 37, "y": 830, "x": 126, "answer": "3"},
            144: {"page": 38, "y": 200, "x": 113, "answer": "2"},
            145: {"page": 38, "y": 850, "x": 113, "answer": "2"},
            147: {"page": 39, "y": 336, "x": 124, "answer": "1"},
        },
    },
    ("securities-trading-regulations", "ch02"): {
        "expectedQuestions": 169,
        "manualStarts": {
            2: {"page": 1, "y": 810, "x": 117, "answer": "1"},
            17: {"page": 4, "y": 1360, "x": 134, "answer": "2"},
            61: {"page": 16, "y": 540, "x": 146, "answer": "2"},
            72: {"page": 19, "y": 1230, "x": 120, "answer": "2"},
            93: {"page": 25, "y": 1190, "x": 108, "answer": "3"},
            102: {"page": 28, "y": 340, "x": 155, "answer": "4"},
            129: {"page": 36, "y": 295, "x": 144, "answer": "2"},
            133: {"page": 37, "y": 335, "x": 135, "answer": "2"},
            149: {"page": 40, "y": 1609, "x": 124, "answer": "4"},
        },
    },
    ("securities-trading-regulations", "ch03"): {
        "expectedQuestions": 84,
        "manualStarts": {
            27: {"page": 7, "y": 1492, "x": 123, "answer": "1"},
            33: {"page": 9, "y": 610, "x": 122, "answer": "4"},
            46: {"page": 12, "y": 855, "x": 105, "answer": "4"},
        },
    },
    ("securities-trading-regulations", "ch04"): {
        "expectedQuestions": 126,
        "preferVisualStarts": True,
        "manualStarts": {
            2: {"page": 1, "y": 902, "x": 145, "answer": "2"},
            4: {"page": 2, "y": 650, "x": 132, "answer": "3"},
            20: {"page": 6, "y": 472, "x": 104, "answer": "4"},
            26: {"page": 7, "y": 1058, "x": 150, "answer": "3"},
            39: {"page": 11, "y": 414, "x": 130, "answer": "4"},
            57: {"page": 16, "y": 272, "x": 120, "answer": "2"},
            60: {"page": 16, "y": 1565, "x": 114, "answer": "4"},
            87: {"page": 24, "y": 1092, "x": 120, "answer": "4"},
            107: {"page": 29, "y": 920, "x": 120, "answer": "2"},
        },
    },
    ("securities-trading-regulations", "ch05"): {
        "expectedQuestions": 108,
        "preferVisualStarts": True,
        "manualStarts": {
            2: {"page": 1, "y": 657, "x": 136, "answer": "4"},
            5: {"page": 2, "y": 360, "x": 145, "answer": "4"},
            12: {"page": 4, "y": 442, "x": 118, "answer": "2"},
            25: {"page": 8, "y": 230, "x": 145, "answer": "2"},
            26: {"page": 8, "y": 650, "x": 145, "answer": "3"},
            38: {"page": 11, "y": 244, "x": 118, "answer": "3"},
            47: {"page": 12, "y": 1537, "x": 145, "answer": "4"},
            68: {"page": 18, "y": 456, "x": 145, "answer": "3"},
            105: {"page": 28, "y": 188, "x": 145, "answer": "4"},
        },
    },
    ("securities-trading-regulations", "ch06"): {
        "expectedQuestions": 131,
        "manualStarts": {
            1: {"page": 1, "y": 445, "x": 163, "answer": "2"},
            27: {"page": 8, "y": 500, "x": 120, "answer": "3"},
            68: {"page": 20, "y": 1618, "x": 112, "answer": "1"},
            78: {"page": 23, "y": 948, "x": 112, "answer": "2"},
            90: {"page": 26, "y": 1468, "x": 112, "answer": "2"},
            97: {"page": 28, "y": 1612, "x": 112, "answer": "2"},
            127: {"page": 38, "y": 336, "x": 112, "answer": "3"},
            128: {"page": 38, "y": 662, "x": 112, "answer": "2"},
        },
    },
    ("securities-trading-regulations", "ch07"): {
        "expectedQuestions": 40,
        "manualStarts": {
            25: {"page": 7, "y": 190, "x": 132, "answer": "4"},
            29: {"page": 8, "y": 300, "x": 123, "answer": "1"},
        },
    },
    ("securities-trading-practice", "ch01"): {
        "expectedQuestions": 43,
        "manualStarts": {
            10: {"page": 2, "y": 1230, "x": 150, "answer": "2"},
            27: {"page": 8, "y": 878, "x": 120, "answer": "3"},
        },
    },
    ("securities-trading-practice", "ch02"): {
        "expectedQuestions": 45,
        "manualStarts": {
            1: {"page": 1, "y": 465, "x": 130, "answer": "1"},
            2: {"page": 1, "y": 785, "x": 130, "answer": "4"},
            3: {"page": 1, "y": 1078, "x": 130, "answer": "2"},
            4: {"page": 1, "y": 1325, "x": 130, "answer": "2"},
            6: {"page": 2, "y": 998, "x": 130, "answer": "4"},
            12: {"page": 4, "y": 318, "x": 130, "answer": "3"},
            14: {"page": 4, "y": 856, "x": 130, "answer": "3"},
            19: {"page": 5, "y": 1136, "x": 130, "answer": "1"},
            28: {"page": 8, "y": 1010, "x": 127, "answer": "3"},
            39: {"page": 11, "y": 510, "x": 110, "answer": "4"},
        },
    },
    ("securities-trading-practice", "ch03"): {
        "expectedQuestions": 47,
        "manualStarts": {
            33: {"page": 9, "y": 550, "x": 126, "answer": "2"},
            41: {"page": 11, "y": 1188, "x": 136, "answer": "2"},
        },
    },
    ("securities-trading-practice", "ch04"): {
        "expectedQuestions": 46,
        "manualStarts": {
            4: {"page": 2, "y": 547, "x": 130, "answer": "3"},
            9: {"page": 3, "y": 456, "x": 130, "answer": "3"},
            10: {"page": 3, "y": 930, "x": 130, "answer": "4"},
            33: {"page": 8, "y": 308, "x": 130, "answer": "3"},
        },
    },
    ("securities-trading-practice", "ch05"): {
        "expectedQuestions": 21,
        "manualStarts": {
            2: {"page": 1, "y": 715, "x": 130, "answer": "4"},
            4: {"page": 1, "y": 1423, "x": 130, "answer": "4"},
            5: {"page": 1, "y": 1584, "x": 130, "answer": "3"},
            9: {"page": 3, "y": 310, "x": 130, "answer": "4"},
        },
    },
    ("securities-trading-practice", "ch06"): {
        "expectedQuestions": 61,
        "manualStarts": {
            7: {"page": 2, "y": 1049, "x": 128, "answer": "4"},
            25: {"page": 6, "y": 705, "x": 120, "answer": "4"},
            28: {"page": 6, "y": 1546, "x": 120, "answer": "3"},
            52: {"page": 12, "y": 323, "x": 120, "answer": "1"},
        },
    },
    ("securities-trading-practice", "ch07"): {
        "expectedQuestions": 47,
        "manualStarts": {
            3: {"page": 1, "y": 1172, "x": 130, "answer": "3"},
            13: {"page": 4, "y": 662, "x": 130, "answer": "4"},
        },
    },
    ("securities-trading-practice", "ch08"): {
        "expectedQuestions": 29,
        "manualStarts": {
            4: {"page": 1, "y": 1553, "x": 120, "answer": "3"},
            14: {"page": 3, "y": 1491, "x": 100, "answer": "4"},
            17: {"page": 4, "y": 1033, "x": 118, "answer": "4"},
            28: {"page": 8, "y": 296, "x": 120, "answer": "4"},
        },
    },
    ("securities-trading-practice", "ch09"): {
        "expectedQuestions": 136,
        "manualStarts": {
            1: {"page": 1, "y": 483, "x": 120, "answer": "4"},
            23: {"page": 7, "y": 1578, "x": 120, "answer": "3"},
            28: {"page": 8, "y": 1520, "x": 120, "answer": "4"},
            33: {"page": 10, "y": 353, "x": 120, "answer": "1"},
            88: {"page": 24, "y": 204, "x": 120, "answer": "3"},
            98: {"page": 26, "y": 255, "x": 120, "answer": "4"},
            109: {"page": 28, "y": 245, "x": 120, "answer": "2"},
            112: {"page": 28, "y": 972, "x": 120, "answer": "4"},
            113: {"page": 28, "y": 1359, "x": 120, "answer": "2"},
            120: {"page": 30, "y": 297, "x": 120, "answer": "2"},
            121: {"page": 30, "y": 496, "x": 120, "answer": "4"},
            126: {"page": 31, "y": 554, "x": 120, "answer": "4"},
            129: {"page": 31, "y": 1550, "x": 120, "answer": "2"},
        },
    },
    ("securities-trading-practice", "ch10"): {
        "expectedQuestions": 116,
        "manualStarts": {
            62: {"page": 17, "y": 447, "x": 120, "answer": "1"},
            89: {"page": 23, "y": 1238, "x": 120, "answer": "4"},
        },
    },
    ("securities-trading-practice", "ch11"): {
        "expectedQuestions": 61,
        "manualStarts": {
            2: {"page": 1, "y": 828, "x": 130, "answer": "1"},
            5: {"page": 2, "y": 729, "x": 130, "answer": "3"},
            7: {"page": 2, "y": 1437, "x": 130, "answer": "2"},
            13: {"page": 4, "y": 840, "x": 130, "answer": "4"},
            17: {"page": 5, "y": 511, "x": 120, "answer": "3"},
            19: {"page": 5, "y": 1094, "x": 120, "answer": "3"},
            29: {"page": 8, "y": 651, "x": 120, "answer": "4"},
            31: {"page": 8, "y": 1193, "x": 120, "answer": "3"},
            50: {"page": 13, "y": 754, "x": 130, "answer": "3"},
            55: {"page": 14, "y": 939, "x": 120, "answer": "2"},
        },
    },
    ("securities-trading-practice", "ch12"): {
        "expectedQuestions": 40,
        "manualStarts": {
            7: {"page": 2, "y": 748, "x": 120, "answer": "3"},
            31: {"page": 7, "y": 455, "x": 120, "answer": "4"},
            37: {"page": 8, "y": 1240, "x": 120, "answer": "4"},
        },
    },
}

for chapter in CHAPTERS:
    override = CHAPTER_OVERRIDES.get((chapter["bankId"], chapter["chapterSlug"]))
    if override:
        chapter.update(override)


QUESTION_RE = re.compile(
    r"^\(?\s*([1-4])\s*\)?\s*(\d{1,3})"
    r"(?!\d)\s*[\.\u3002\uff0e]\s*"
)
MARKER_RE = re.compile(
    r"\(?\s*([1-4])\s*\)?\s*[^0-9]{0,8}?(\d{1,3})"
    r"(?!\d)\s*[\.\u3002\uff0e]"
)


@dataclass
class OcrLine:
    text: str
    score: float
    x1: int
    y1: int
    x2: int
    y2: int


@dataclass
class Point:
    page: int
    y: int

    @property
    def key(self) -> int:
        return self.page * 10000 + self.y


@dataclass
class QuestionAnchor:
    page: int
    y: int
    x: int


@dataclass
class CropSegment:
    page: int
    src: str
    x: int
    y: int
    width: int
    height: int
    pageWidth: int
    pageHeight: int


@dataclass
class MaskRect:
    x: int
    y: int
    width: int
    height: int


@dataclass
class ImageQuestion:
    id: str
    bankId: str
    bankTitle: str
    chapterId: str
    chapterTitle: str
    number: int
    answer: str
    sourceFile: str
    questionSegments: list[CropSegment]
    explanationSegments: list[CropSegment]
    answerMask: MaskRect | None


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    return normalized.replace(" ", "").replace("\u3000", "")


def parse_question_marker(text: str, *, anchored: bool) -> tuple[str, int] | None:
    normalized = normalize_text(text)
    match = QUESTION_RE.match(normalized)
    if not match and not anchored:
        match = MARKER_RE.search(normalized)
    if not match:
        return None
    answer, raw_number = match.groups()
    return answer, int(raw_number)


def image_size(image_dir: Path) -> tuple[int, int]:
    first_page = next(iter(sorted(image_dir.glob(f"page-*.{IMAGE_EXT}"))), None)
    if first_page is None:
        raise RuntimeError(f"No rendered pages found in {image_dir}")
    with Image.open(first_page) as image:
        return image.size


def ensure_rendered_pages(chapter: dict[str, Any]) -> None:
    image_dir = PUBLIC / "pdf-pages" / chapter["bankId"] / chapter["chapterSlug"]
    if next(iter(sorted(image_dir.glob(f"page-*.{IMAGE_EXT}"))), None) is not None:
        return

    source_path = PDF_SOURCE_DIR / str(chapter["sourceFile"])
    if not source_path.exists():
        raise RuntimeError(f"Missing source PDF: {source_path}")

    pdftoppm = shutil.which("pdftoppm")
    if pdftoppm:
        pdftoppm_path = Path(pdftoppm)
        if pdftoppm_path.suffix.lower() == ".cmd":
            bundled_exe = (
                pdftoppm_path.parent.parent
                / "native"
                / "poppler"
                / "Library"
                / "bin"
                / "pdftoppm.exe"
            )
            if bundled_exe.exists():
                pdftoppm_path = bundled_exe
    else:
        raise RuntimeError("pdftoppm is required to render PDF question pages")

    tmp_dir = ROOT / "tmp" / "pdf-render" / chapter["bankId"] / chapter["chapterSlug"]
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True, exist_ok=True)
    image_dir.mkdir(parents=True, exist_ok=True)

    output_prefix = tmp_dir / "page"
    subprocess.run(
        [
            str(pdftoppm_path),
            "-r",
            str(PDF_RENDER_DPI),
            "-png",
            str(source_path),
            str(output_prefix),
        ],
        check=True,
    )

    rendered_pages = sorted(
        tmp_dir.glob("page-*.png"),
        key=lambda path: int(re.search(r"-(\d+)\.png$", path.name).group(1)),
    )
    if not rendered_pages:
        raise RuntimeError(f"PDF rendered no pages: {source_path}")

    for index, page_path in enumerate(rendered_pages, start=1):
        with Image.open(page_path) as image:
            image.save(
                image_dir / f"page-{index:02d}.{IMAGE_EXT}",
                quality=84,
                method=6,
            )


def ocr_page(ocr: RapidOCR | None, image_path: Path, cache_path: Path) -> list[OcrLine]:
    if cache_path.exists():
        raw = json.loads(cache_path.read_text(encoding="utf-8"))
        return [OcrLine(**item) for item in raw]

    if ocr is None:
        ocr = get_ocr_engine()

    result, _ = ocr(str(image_path))
    lines: list[OcrLine] = []
    for item in result or []:
        box, text, score = item
        xs = [point[0] for point in box]
        ys = [point[1] for point in box]
        lines.append(
            OcrLine(
                text=str(text),
                score=float(score),
                x1=round(min(xs)),
                y1=round(min(ys)),
                x2=round(max(xs)),
                y2=round(max(ys)),
            )
        )

    lines.sort(key=lambda line: (line.y1, line.x1))
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps([asdict(line) for line in lines], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return lines


def candidate_question_starts(
    lines_by_page: dict[int, list[OcrLine]],
    expected: int | None,
) -> dict[int, list[dict[str, Any]]]:
    candidates: dict[int, list[dict[str, Any]]] = {}
    for page, lines in lines_by_page.items():
        for line in lines:
            if line.y1 < BODY_TOP or line.y1 > BODY_BOTTOM:
                continue
            if line.x1 > 260:
                continue
            parsed = parse_question_marker(line.text, anchored=True)
            if not parsed:
                continue
            answer, number = parsed
            if number < 1 or number > (expected or 400):
                continue

            candidate = {
                "page": page,
                "number": number,
                "answer": answer,
                "line": line,
                "key": page * 10000 + line.y1,
                "source": "ocr",
            }
            candidates.setdefault(number, []).append(candidate)

    for items in candidates.values():
        items.sort(key=lambda item: item["key"])
    return candidates


def choose_sequential_starts(
    candidates: dict[int, list[dict[str, Any]]],
    expected: int,
) -> list[dict[str, Any]]:
    starts: list[dict[str, Any]] = []
    previous_key = -1
    for number in range(1, expected + 1):
        valid = [item for item in candidates.get(number, []) if item["key"] > previous_key]
        if not valid:
            continue
        chosen = min(valid, key=lambda item: item["key"])
        starts.append(chosen)
        previous_key = chosen["key"]
    return starts


def add_manual_starts(
    candidates: dict[int, list[dict[str, Any]]],
    manual_starts: dict[int, dict[str, Any]] | None,
) -> None:
    if not manual_starts:
        return
    for number, item in manual_starts.items():
        page = int(item["page"])
        y = int(item["y"])
        x = int(item.get("x", CROP_X))
        answer = str(item["answer"])
        line = OcrLine(
            text=f"({answer}){number}.",
            score=1,
            x1=x,
            y1=y,
            x2=x + 180,
            y2=y + 38,
        )
        candidates[int(number)] = [
            {
                "page": page,
                "number": int(number),
                "answer": answer,
                "line": line,
                "key": page * 10000 + y,
                "source": "manual",
            }
        ]


def load_answer_report(report_path: Path | None) -> dict[int, dict[str, Any]]:
    if not report_path or not report_path.exists():
        return {}
    report = json.loads(report_path.read_text(encoding="utf-8"))
    by_number: dict[int, dict[str, Any]] = {}
    for item in report.get("answers", []):
        number = int(item["number"])
        answer = ANSWER_TO_NUMBER.get(str(item["answer"]))
        if not answer:
            continue
        by_number[number] = {**item, "answerNumber": answer}
    return by_number


def typical_x_for_page(starts: list[dict[str, Any]], page: int, fallback: int) -> int:
    xs = [item["line"].x1 for item in starts if item["page"] == page and item["line"].x1 <= 260]
    if xs:
        return sorted(xs)[len(xs) // 2]
    return max(CROP_X, min(220, fallback))


def fill_starts_from_answer_report(
    starts: list[dict[str, Any]],
    report_by_number: dict[int, dict[str, Any]],
    expected: int,
    scale: float,
) -> list[dict[str, Any]]:
    by_number = {int(item["number"]): item for item in starts}
    for number in range(1, expected + 1):
        if number in by_number:
            continue
        report = report_by_number.get(number)
        if not report:
            continue
        page = int(report["page"])
        y = max(BODY_TOP, min(BODY_BOTTOM - 24, round(float(report["y"]) * scale)))
        x = typical_x_for_page(starts, page, round(float(report.get("x", CROP_X)) * scale))
        answer = report["answerNumber"]
        line = OcrLine(
            text=f"({answer}){number}.",
            score=float(report.get("score", 1)),
            x1=x,
            y1=y,
            x2=x + 180,
            y2=y + 38,
        )
        by_number[number] = {
            "page": page,
            "number": number,
            "answer": answer,
            "line": line,
            "key": page * 10000 + y,
            "source": "answer-report",
        }

    return [by_number[number] for number in sorted(by_number)]


def starts_from_answer_report(
    report_by_number: dict[int, dict[str, Any]],
    expected: int,
    scale: float,
) -> list[dict[str, Any]]:
    starts: list[dict[str, Any]] = []
    for number in range(1, expected + 1):
        report = report_by_number.get(number)
        if not report:
            break
        page = int(report["page"])
        y = max(BODY_TOP, min(BODY_BOTTOM - 24, round(float(report["y"]) * scale)))
        x = max(CROP_X, min(220, round(float(report.get("x", CROP_X)) * scale)))
        answer = report["answerNumber"]
        line = OcrLine(
            text=f"({answer}){number}.",
            score=float(report.get("score", 1)),
            x1=x,
            y1=y,
            x2=x + 180,
            y2=y + 38,
        )
        starts.append(
            {
                "page": page,
                "number": number,
                "answer": answer,
                "line": line,
                "key": page * 10000 + y,
                "source": "answer-report",
            }
        )
    return starts


def detect_question_starts(
    lines_by_page: dict[int, list[OcrLine]],
    chapter: dict[str, Any],
    ocr: RapidOCR | None = None,
    image_dir: Path | None = None,
) -> list[dict[str, Any]]:
    configured_expected = chapter.get("expectedQuestions")
    expected = int(configured_expected) if configured_expected else None
    report_path = chapter.get("answerReport")
    if report_path and expected is not None:
        report_starts = starts_from_answer_report(
            load_answer_report(report_path),
            expected,
            float(chapter.get("answerReportScale", 1)),
        )
        if len(report_starts) == expected:
            return report_starts

    candidates = candidate_question_starts(lines_by_page, expected)
    add_manual_starts(candidates, chapter.get("manualStarts"))

    if expected is None:
        inferred_numbers = sorted(number for number in candidates if 1 <= number <= 400)
        if not inferred_numbers:
            raise RuntimeError(f"{chapter['chapterId']} could not infer question count")
        expected = max(inferred_numbers)

    if (
        chapter.get("preferVisualStarts")
        and chapter.get("allowWideVisualStartScan")
        and ocr is not None
        and image_dir is not None
    ):
        add_visual_marker_starts(
            candidates,
            ocr,
            image_dir,
            chapter,
            expected,
            missing_numbers=list(range(1, expected + 1)),
        )
        add_manual_starts(candidates, chapter.get("manualStarts"))

    starts = choose_sequential_starts(candidates, expected)

    found = {int(start["number"]) for start in starts}
    missing_after_ocr = [number for number in range(1, expected + 1) if number not in found]
    visual_scan_limit = int(chapter.get("maxVisualStartScan", 20))
    if (
        len(found) != expected
        and image_dir is not None
        and not chapter.get("disableVisualStarts")
        and (chapter.get("allowVisualStartScan") or chapter.get("allowWideVisualStartScan"))
        and (
            chapter.get("allowWideVisualStartScan")
            or len(missing_after_ocr) <= visual_scan_limit
        )
    ):
        ocr = ocr or get_ocr_engine()
        add_visual_marker_starts(
            candidates,
            ocr,
            image_dir,
            chapter,
            expected,
            missing_numbers=missing_after_ocr,
        )
        starts = choose_sequential_starts(candidates, expected)

    if report_path:
        starts = fill_starts_from_answer_report(
            starts,
            load_answer_report(report_path),
            expected,
            float(chapter.get("answerReportScale", 1)),
        )
        starts = choose_sequential_starts(
            {int(item["number"]): [item] for item in starts},
            expected,
        )

    found = [int(start["number"]) for start in starts]
    missing = [number for number in range(1, expected + 1) if number not in found]
    if missing or len(found) != expected:
        raise RuntimeError(
            f"{chapter['chapterId']} OCR question count mismatch: "
            f"found {len(found)}, expected {expected}, missing={missing[:30]}"
        )

    return starts


def detect_explanations(lines_by_page: dict[int, list[OcrLine]]) -> list[dict[str, Any]]:
    explanations: list[dict[str, Any]] = []
    for page, lines in lines_by_page.items():
        for line in lines:
            if line.y1 < BODY_TOP or line.y1 > BODY_BOTTOM:
                continue
            text = normalize_text(line.text)
            if not text_has_explanation_marker(text):
                continue
            explanations.append(
                {
                    "page": page,
                    "line": line,
                    "key": page * 10000 + line.y1,
                }
            )
    return sorted(explanations, key=lambda item: item["key"])


def text_has_explanation_marker(value: str) -> bool:
    text = normalize_text(value)
    if "\u89e3\u6790" in text:
        return True
    return bool(re.search(r"\u89e3.{0,2}[\u6790\u6298\u7948\u8a22\u542c]", text))


def is_page_number_artifact(line: OcrLine, crop_right: int) -> bool:
    text = normalize_text(line.text)
    if not re.fullmatch(r"\d{1,3}", text):
        return False
    if line.x1 < crop_right - 210:
        return False
    if line.x2 - line.x1 > 95 or line.y2 - line.y1 > 64:
        return False
    return True


def content_bounds(
    image_path: Path,
    crop_x: int,
    y1: int,
    y2: int,
    crop_right: int,
) -> tuple[int, int] | None:
    if y2 <= y1:
        return None

    with Image.open(image_path) as image:
        gray = image.convert("L")
        crop = gray.crop((crop_x, y1, crop_right, y2))
        data = np.asarray(crop)
        min_dark_pixels = max(8, int(crop.width * 0.006))
        row_indices = (np.flatnonzero((data < 175).sum(axis=1) >= min_dark_pixels) + y1).tolist()

    if not row_indices:
        return None

    groups = grouped_indices(row_indices, 5)
    return (
        max(BODY_TOP, y1, groups[0][0] - SEGMENT_PAD_TOP),
        min(BODY_BOTTOM, y2, groups[-1][1] + SEGMENT_PAD_BOTTOM),
    )


def ocr_content_bounds(
    lines: list[OcrLine],
    crop_x: int,
    y1: int,
    y2: int,
    crop_right: int,
    preserve_top: bool,
) -> tuple[int, int] | None:
    relevant = [
        line
        for line in lines
        if line.y2 >= y1
        and line.y1 <= y2
        and line.x2 >= crop_x
        and line.x1 <= crop_right
        and line.y1 < BODY_BOTTOM
        and not is_page_number_artifact(line, crop_right)
    ]
    if not relevant:
        return None

    top = y1 if preserve_top else min(line.y1 for line in relevant) - SEGMENT_PAD_TOP
    content_bottom = max(line.y2 for line in relevant)
    bottom = content_bottom + SEGMENT_PAD_BOTTOM
    artifact_tops = [
        line.y1
        for line in lines
        if is_page_number_artifact(line, crop_right)
        and line.y1 > content_bottom
        and line.y1 <= bottom
    ]
    if artifact_tops:
        bottom = min(bottom, min(artifact_tops) - 18)
    return (
        max(BODY_TOP, y1, top),
        min(BODY_BOTTOM, y2, bottom),
    )


def has_dark_content_near_bottom(
    image_path: Path,
    crop_x: int,
    y2: int,
    crop_right: int,
) -> bool:
    y1 = max(BODY_TOP, y2 - 12)
    if y2 <= y1:
        return False

    with Image.open(image_path) as image:
        gray = image.convert("L")
        crop = gray.crop((crop_x, y1, crop_right, y2))
        dark_pixels = int((np.asarray(crop) < 150).sum())

    density = dark_pixels / max(1, crop.width * crop.height)
    return density > 0.02


def make_segments(
    bank_id: str,
    chapter_slug: str,
    start: Point,
    end: Point,
    page_width: int,
    page_height: int,
    crop_x: int = CROP_X,
    continuation_crop_x: int | None = None,
    image_dir: Path | None = None,
    lines_by_page: dict[int, list[OcrLine]] | None = None,
    segment_bottoms: dict[int, int] | None = None,
    safe_bottom_pad: int = SEGMENT_SAFE_BOTTOM_PAD,
) -> list[CropSegment]:
    segments: list[CropSegment] = []
    for page in range(start.page, end.page + 1):
        y1 = start.y if page == start.page else BODY_TOP
        y2 = end.y if page == end.page else BODY_BOTTOM
        y1 = max(BODY_TOP, min(BODY_BOTTOM, y1))
        y2 = max(BODY_TOP, min(BODY_BOTTOM, y2))
        manual_bottom = min(page_height, int(segment_bottoms[page])) if segment_bottoms and page in segment_bottoms else None
        if manual_bottom is not None:
            y2 = max(y2, manual_bottom)
        if y2 - y1 < 24:
            continue
        scan_y1 = y1
        scan_y2 = y2
        page_crop_x = crop_x if page == start.page else (continuation_crop_x if continuation_crop_x is not None else crop_x)
        if image_dir:
            trimmed = (
                ocr_content_bounds(
                    lines_by_page.get(page, []) if lines_by_page is not None else [],
                    page_crop_x,
                    scan_y1,
                    scan_y2,
                    min(CROP_RIGHT, page_width),
                    preserve_top=page == start.page,
                )
                if lines_by_page is not None
                else None
            )
            if not trimmed:
                trimmed = content_bounds(
                    image_dir / f"page-{page:02d}.{IMAGE_EXT}",
                    page_crop_x,
                    scan_y1,
                    scan_y2,
                    min(CROP_RIGHT, page_width),
                )
            if trimmed:
                y1, y2 = trimmed
            else:
                y1, y2 = scan_y1, scan_y2
            if (
                page != end.page
                and y2 >= BODY_BOTTOM
                and has_dark_content_near_bottom(
                    image_dir / f"page-{page:02d}.{IMAGE_EXT}",
                    page_crop_x,
                    y2,
                    min(CROP_RIGHT, page_width),
                )
            ):
                y2 = min(page_height, y2 + PAGE_BREAK_BOTTOM_PAD)
            if manual_bottom is not None:
                y2 = max(y2, manual_bottom)
        if page != start.page and lines_by_page is not None:
            has_text = any(
                line.y2 >= y1
                and line.y1 <= y2
                and line.x2 >= page_crop_x
                and line.x1 <= min(CROP_RIGHT, page_width)
                for line in lines_by_page.get(page, [])
            )
            if not has_text:
                continue
        if y2 - y1 < 24:
            continue
        y1 = max(BODY_TOP, y1 - SEGMENT_SAFE_TOP_PAD)
        y2 = min(BODY_BOTTOM, page_height, y2 + safe_bottom_pad)
        if lines_by_page is not None:
            artifact_tops = [
                line.y1
                for line in lines_by_page.get(page, [])
                if is_page_number_artifact(line, min(CROP_RIGHT, page_width))
                and line.y1 >= y1
                and line.y1 < y2
            ]
            if artifact_tops:
                y2 = min(y2, min(artifact_tops) - 8)
        if y2 - y1 < 24:
            continue
        segments.append(
            CropSegment(
                page=page,
                src=f"pdf-pages/{bank_id}/{chapter_slug}/page-{page:02d}.{IMAGE_EXT}",
                x=page_crop_x,
                y=y1,
                width=min(CROP_RIGHT, page_width) - page_crop_x,
                height=y2 - y1,
                pageWidth=page_width,
                pageHeight=page_height,
            )
        )
    return segments


def fallback_explanation(end_key: int) -> dict[str, Any]:
    page = max(1, end_key // 10000)
    y = max(BODY_TOP, min(BODY_BOTTOM, end_key % 10000))
    line = OcrLine("", 0, CROP_X, y, CROP_RIGHT, y + 1)
    return {"page": page, "line": line, "key": page * 10000 + y}


OPTION_ANY_RE = re.compile(r"[\(\uff08]\s*[1-4]\s*[\)\uff09]")
OPTION_FOUR_RE = re.compile(r"[\(\uff08]\s*4\s*[\)\uff09]")
FORMULA_PREFIX_RE = re.compile(r"[=%$／/÷]")


def detect_explanation_after_options(
    start: dict[str, Any],
    end_key: int,
    lines_by_page: dict[int, list[OcrLine]],
    image_dir: Path,
) -> dict[str, Any] | None:
    option_lines: list[tuple[int, OcrLine]] = []
    start_page = int(start["page"])
    end_page = end_key // 10000
    for page in range(start_page, end_page + 1):
        lines = lines_by_page.get(page, [])
        for line in lines:
            key = page * 10000 + line.y1
            if key <= start["key"] or key >= end_key:
                continue
            if OPTION_FOUR_RE.search(unicodedata.normalize("NFKC", line.text)):
                option_lines.append((page, line))

    if not option_lines:
        return None

    option_page, option_line = max(option_lines, key=lambda item: item[0] * 10000 + item[1].y1)
    for page in range(option_page, end_page + 1):
        y1 = option_line.y2 + 1 if page == option_page else BODY_TOP
        y2 = min(BODY_BOTTOM, end_key % 10000 if page == end_key // 10000 else BODY_BOTTOM)
        if y2 - y1 < 24:
            continue
        content_lines = [
            line
            for line in lines_by_page.get(page, [])
            if line.y2 >= y1
            and line.y1 <= y2
            and line.x2 >= CROP_X
            and line.x1 <= CROP_RIGHT
        ]
        if not content_lines:
            continue
        first_line = min(content_lines, key=lambda line: (line.y1, line.x1))
        vertical_gap = first_line.y1 - option_line.y2 if page == option_page else 999
        if not text_has_explanation_marker(first_line.text) and vertical_gap < 36:
            continue
        if text_has_explanation_marker(first_line.text):
            y = first_line.y1
        else:
            bounds = ocr_content_bounds(
                content_lines,
                CROP_X,
                y1,
                y2,
                CROP_RIGHT,
                preserve_top=False,
            )
            if not bounds:
                bounds = content_bounds(
                    image_dir / f"page-{page:02d}.{IMAGE_EXT}",
                    CROP_X,
                    y1,
                    y2,
                    CROP_RIGHT,
                )
            if not bounds:
                continue
            y = bounds[0]
        line = OcrLine("", 1, CROP_X, y, CROP_RIGHT, y + 1)
        return {"page": page, "line": line, "key": page * 10000 + y}

    return None


def make_answer_mask(start_line: OcrLine, number: int) -> MaskRect:
    digits = len(str(number))
    return MaskRect(
        x=max(CROP_X, start_line.x1 - 10),
        y=max(BODY_TOP, start_line.y1 - 8),
        width=100 + (digits * 18),
        height=max(50, start_line.y2 - start_line.y1 + 16),
    )


def grouped_indices(indices: list[int], max_gap: int) -> list[tuple[int, int]]:
    if not indices:
        return []

    groups: list[tuple[int, int]] = []
    start = previous = indices[0]
    for index in indices[1:]:
        if index - previous <= max_gap:
            previous = index
        else:
            groups.append((start, previous))
            start = previous = index
    groups.append((start, previous))
    return groups


def dark_row_bands(image: Image.Image, approx_y: int) -> list[tuple[int, int]]:
    gray = image.convert("L")
    y1 = max(BODY_TOP, approx_y - 130)
    y2 = min(BODY_BOTTOM, approx_y + 90)
    if y2 <= y1:
        return []

    crop = gray.crop((CROP_X, y1, CROP_RIGHT, y2))
    data = np.asarray(crop)
    row_indices = (np.flatnonzero((data < 165).sum(axis=1) > 18) + y1).tolist()

    return grouped_indices(row_indices, 3)


def dark_column_groups(image: Image.Image, y_band: tuple[int, int]) -> list[tuple[int, int]]:
    gray = image.convert("L")
    y1 = max(BODY_TOP, y_band[0] - 2)
    y2 = min(BODY_BOTTOM, y_band[1] + 3)
    if y2 <= y1:
        return []

    crop = gray.crop((CROP_X, y1, CROP_RIGHT, y2))
    data = np.asarray(crop)
    col_indices = (np.flatnonzero((data < 155).sum(axis=0) > 1) + CROP_X).tolist()

    return [group for group in grouped_indices(col_indices, 2) if group[1] - group[0] >= 3]


def question_number_x_from_marker_groups(groups: list[tuple[int, int]]) -> int | None:
    """Return the x position of the printed question number after the hidden answer marker."""
    if len(groups) < 2:
        return None

    widths = [group[1] - group[0] for group in groups]

    # Some PDFs render "(4)" as one connected dark group, followed by the question number.
    if widths[0] >= 28:
        return groups[1][0]

    # Some render "(3)" as two connected pieces: "(3" and ")".
    if len(groups) >= 3 and widths[0] >= 18 and widths[1] <= 14:
        return groups[2][0]

    # Some render the opening parenthesis separately, then connect the answer digit
    # with the closing parenthesis, e.g. "(" + "4)" + "6.".
    if len(groups) >= 3 and widths[0] <= 16 and widths[1] >= 18:
        return groups[2][0]

    # Common case: "(", answer digit, ")" are separate groups.
    if len(groups) >= 4 and widths[0] <= 16 and widths[1] <= 16 and widths[2] <= 16:
        return groups[3][0]

    return groups[1][0]


def left_marker_bands(image: Image.Image) -> list[tuple[int, int]]:
    gray = image.convert("L")
    crop_x1 = 70
    crop_x2 = 260
    crop = gray.crop((crop_x1, BODY_TOP, crop_x2, BODY_BOTTOM))
    pixels = crop.load()
    row_indices: list[int] = []
    for row in range(crop.height):
        dark_count = 0
        for col in range(crop.width):
            if pixels[col, row] < 165:
                dark_count += 1
        if dark_count >= 8:
            row_indices.append(row + BODY_TOP)

    return [
        band
        for band in grouped_indices(row_indices, 3)
        if 10 <= band[1] - band[0] <= 70
    ]


def ocr_marker_crop(
    ocr: RapidOCR,
    image: Image.Image,
    crop_box: tuple[int, int, int, int],
    cache_path: Path,
) -> list[dict[str, Any]]:
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    crop_path = cache_path.with_suffix(".png")
    image.crop(crop_box).save(crop_path)
    try:
        result, _ = ocr(str(crop_path))
    finally:
        if crop_path.exists():
            crop_path.unlink()

    lines: list[dict[str, Any]] = []
    for item in result or []:
        box, text, score = item
        xs = [point[0] for point in box]
        ys = [point[1] for point in box]
        lines.append(
            {
                "text": str(text),
                "score": float(score),
                "x1": round(min(xs)),
                "y1": round(min(ys)),
                "x2": round(max(xs)),
                "y2": round(max(ys)),
            }
        )
    lines.sort(key=lambda line: (line["y1"], line["x1"]))
    cache_path.write_text(json.dumps(lines, ensure_ascii=False, indent=2), encoding="utf-8")
    return lines


def parse_marker_crop(lines: list[dict[str, Any]]) -> tuple[str, int, OcrLine] | None:
    if not lines:
        return None

    combined = "".join(line["text"] for line in sorted(lines, key=lambda line: line["x1"]))
    parsed = parse_question_marker(combined, anchored=False)
    if not parsed:
        return None

    answer, number = parsed
    first = min(lines, key=lambda line: line["x1"])
    last = max(lines, key=lambda line: line["x2"])
    top = min(line["y1"] for line in lines)
    bottom = max(line["y2"] for line in lines)
    return (
        answer,
        number,
        OcrLine(
            text=combined,
            score=min(float(line["score"]) for line in lines),
            x1=int(first["x1"]),
            y1=int(top),
            x2=int(last["x2"]),
            y2=int(bottom),
        ),
    )


def add_visual_marker_starts(
    candidates: dict[int, list[dict[str, Any]]],
    ocr: RapidOCR,
    image_dir: Path,
    chapter: dict[str, Any],
    expected: int,
    missing_numbers: list[int],
) -> None:
    if not missing_numbers:
        return

    missing = set(missing_numbers)
    cache_dir = MARKER_OCR_CACHE / DERIVED_OCR_CACHE_VERSION / chapter["bankId"] / chapter["chapterSlug"]
    for image_path in sorted(image_dir.glob(f"page-*.{IMAGE_EXT}")):
        page_match = re.search(r"page-(\d+)", image_path.stem)
        if not page_match:
            continue
        page = int(page_match.group(1))
        with Image.open(image_path) as image:
            for band in left_marker_bands(image):
                crop_y1 = max(BODY_TOP, band[0] - 15)
                crop_y2 = min(BODY_BOTTOM, band[1] + 32)
                crop_box = (70, crop_y1, 360, crop_y2)
                cache_path = cache_dir / f"x{crop_box[0]}-{crop_box[2]}-page-{page:02d}-y{band[0]:04d}.json"
                parsed = parse_marker_crop(ocr_marker_crop(ocr, image, crop_box, cache_path))
                if not parsed:
                    continue
                answer, number, line = parsed
                if number not in missing or number < 1 or number > expected:
                    continue

                adjusted_line = OcrLine(
                    text=line.text,
                    score=line.score,
                    x1=line.x1 + crop_box[0],
                    y1=line.y1 + crop_box[1],
                    x2=line.x2 + crop_box[0],
                    y2=line.y2 + crop_box[1],
                )
                candidates[number] = [
                    {
                        "page": page,
                        "number": number,
                        "answer": answer,
                        "line": adjusted_line,
                        "key": page * 10000 + max(BODY_TOP, band[0]),
                        "source": "visual-marker",
                    }
                ]


def detect_visual_explanation(
    ocr: RapidOCR,
    image_dir: Path,
    chapter: dict[str, Any],
    start: dict[str, Any],
    end_key: int,
) -> dict[str, Any] | None:
    cache_dir = EXPLANATION_OCR_CACHE / DERIVED_OCR_CACHE_VERSION / chapter["bankId"] / chapter["chapterSlug"]
    start_page = int(start["page"])
    end_page = end_key // 10000
    window_height = 220
    window_step = 120

    for page in range(start_page, end_page + 1):
        image_path = image_dir / f"page-{page:02d}.{IMAGE_EXT}"
        if not image_path.exists():
            continue
        page_y1 = max(BODY_TOP, int(start["line"].y2) + 8 if page == start_page else BODY_TOP)
        page_y2 = min(BODY_BOTTOM, end_key % 10000 if page == end_page else BODY_BOTTOM)
        if page_y2 - page_y1 < 36:
            continue

        with Image.open(image_path) as image:
            y = page_y1
            while y < page_y2:
                crop_y1 = max(BODY_TOP, y)
                crop_y2 = min(page_y2, y + window_height)
                if crop_y2 - crop_y1 < 36:
                    break

                crop_box = (150, crop_y1, min(760, image.width), crop_y2)
                cache_path = cache_dir / f"page-{page:02d}-y{crop_y1:04d}-{crop_y2:04d}.json"
                lines = ocr_marker_crop(ocr, image, crop_box, cache_path)
                for line in sorted(lines, key=lambda item: (item["y1"], item["x1"])):
                    if not text_has_explanation_marker(str(line["text"])):
                        continue
                    marker_y1 = int(line["y1"])
                    prefix_lines = [
                        candidate
                        for candidate in lines
                        if marker_y1 - 48 <= int(candidate["y1"]) < marker_y1
                        and not OPTION_ANY_RE.search(unicodedata.normalize("NFKC", str(candidate["text"])))
                    ]
                    prefix_y1 = (
                        min(int(candidate["y1"]) for candidate in prefix_lines)
                        if any(FORMULA_PREFIX_RE.search(str(candidate["text"])) for candidate in prefix_lines)
                        else marker_y1
                    )
                    adjusted_line = OcrLine(
                        text=str(line["text"]),
                        score=float(line["score"]),
                        x1=int(line["x1"]) + crop_box[0],
                        y1=prefix_y1 + crop_box[1],
                        x2=int(line["x2"]) + crop_box[0],
                        y2=int(line["y2"]) + crop_box[1],
                    )
                    return {
                        "page": page,
                        "line": adjusted_line,
                        "key": page * 10000 + adjusted_line.y1,
                        "source": "visual-explanation",
                    }

                if crop_y2 >= page_y2:
                    break
                y += window_step

    return None


def detect_question_anchor(image_dir: Path, start: dict[str, Any]) -> QuestionAnchor:
    start_line: OcrLine = start["line"]
    image_path = image_dir / f"page-{int(start['page']):02d}.{IMAGE_EXT}"
    with Image.open(image_path) as image:
        bands = dark_row_bands(image, start_line.y1)
        if not bands:
            return QuestionAnchor(
                page=int(start["page"]),
                y=max(BODY_TOP, start_line.y1),
                x=max(CROP_X, min(CROP_RIGHT - 360, start_line.x1 + QUESTION_NUMBER_OFFSET)),
            )

        band_options: list[tuple[float, tuple[int, int], list[tuple[int, int]]]] = []
        for band in bands:
            groups = dark_column_groups(image, band)
            if not groups:
                continue
            y_distance = abs(((band[0] + band[1]) // 2) - start_line.y1)
            x_distance = abs(groups[0][0] - start_line.x1)
            band_options.append((y_distance + (0.65 * x_distance), band, groups))

        if not band_options:
            y_band = min(bands, key=lambda band: abs(((band[0] + band[1]) // 2) - start_line.y1))
            groups = []
        else:
            _, y_band, groups = min(band_options, key=lambda item: item[0])
            groups = [group for group in groups if group[1] >= start_line.x1 - 35]

    marker_question_x = question_number_x_from_marker_groups(groups)
    if marker_question_x is not None:
        return QuestionAnchor(
            page=int(start["page"]),
            y=max(BODY_TOP, y_band[0] - SEGMENT_PAD_TOP),
            x=max(CROP_X, min(CROP_RIGHT - 360, marker_question_x - QUESTION_X_PAD)),
        )

    if len(groups) >= 2:
        question_x = groups[1][0]
        question_group_index = 1
        if int(start["number"]) >= 100 and len(groups) >= 4:
            first_width = groups[0][1] - groups[0][0]
            if first_width >= 25:
                question_group_index = 1
            elif first_width >= 16:
                question_group_index = 2
            else:
                question_group_index = 3
            question_x = groups[question_group_index][0]
        else:
            for index in range(1, min(len(groups), 6)):
                if groups[index][0] - groups[index - 1][1] >= 7:
                    question_x = groups[index][0]
                    question_group_index = index
                    break
    else:
        question_x = start_line.x1 + QUESTION_NUMBER_OFFSET
        question_group_index = 0

    previous_group_end = groups[question_group_index - 1][1] if question_group_index > 0 and groups else CROP_X - 1

    return QuestionAnchor(
        page=int(start["page"]),
        y=max(BODY_TOP, y_band[0] - 3),
        x=max(CROP_X, min(CROP_RIGHT - 360, max(question_x, previous_group_end + 1))),
    )


def apply_manual_anchors(
    anchors_by_number: dict[int, QuestionAnchor],
    manual_anchors: dict[int, dict[str, Any]] | None,
) -> None:
    if not manual_anchors:
        return

    for number, item in manual_anchors.items():
        anchor = anchors_by_number.get(int(number))
        if not anchor:
            continue
        anchors_by_number[int(number)] = QuestionAnchor(
            page=int(item.get("page", anchor.page)),
            y=int(item.get("y", anchor.y)),
            x=int(item.get("x", anchor.x)),
        )


def build_chapter(ocr: RapidOCR | None, chapter: dict[str, Any]) -> dict[str, Any]:
    bank_id = chapter["bankId"]
    chapter_slug = chapter["chapterSlug"]
    image_dir = PUBLIC / "pdf-pages" / bank_id / chapter_slug
    ensure_rendered_pages(chapter)
    page_paths = sorted(image_dir.glob(f"page-*.{IMAGE_EXT}"))
    page_width, page_height = image_size(image_dir)

    configured_cache_dir = chapter.get("ocrCacheDir")
    cache_dir = (
        OCR_CACHE / DERIVED_OCR_CACHE_VERSION / str(configured_cache_dir)
        if configured_cache_dir
        else OCR_CACHE / DERIVED_OCR_CACHE_VERSION / bank_id / chapter_slug
    )
    lines_by_page: dict[int, list[OcrLine]] = {}
    for page, image_path in enumerate(page_paths, start=1):
        cache_path = cache_dir / f"page-{page:02d}.json"
        if not cache_path.exists():
            print(
                f"  OCR {chapter['bankTitle']} {chapter['chapterId']} page {page}/{len(page_paths)}",
                flush=True,
            )
            ocr = ocr or get_ocr_engine()
        lines_by_page[page] = ocr_page(ocr, image_path, cache_path)

    starts = detect_question_starts(lines_by_page, chapter, ocr, image_dir)
    anchors_by_number = {
        int(start["number"]): detect_question_anchor(image_dir, start) for start in starts
    }
    apply_manual_anchors(anchors_by_number, chapter.get("manualAnchors"))
    explanations = detect_explanations(lines_by_page)
    manual_explanations = chapter.get("manualExplanations", {})
    manual_segment_bottoms = chapter.get("manualQuestionSegmentBottoms", {})
    questions: list[ImageQuestion] = []

    for index, start in enumerate(starts):
        next_start = starts[index + 1] if index + 1 < len(starts) else None
        start_key = start["key"]
        end_key = next_start["key"] if next_start else (len(page_paths) * 10000 + BODY_BOTTOM)
        manual_explanation = manual_explanations.get(int(start["number"]))
        if manual_explanation:
            y = int(manual_explanation["y"])
            line = OcrLine("", 1, CROP_X, y, CROP_RIGHT, y + 1)
            explanation = {
                "page": int(manual_explanation["page"]),
                "line": line,
                "key": int(manual_explanation["page"]) * 10000 + y,
            }
        else:
            ocr_explanation = next(
                (item for item in explanations if start_key < item["key"] < end_key),
                None,
            )
            visual_explanation = (
                None
                if ocr_explanation
                else detect_visual_explanation(ocr or get_ocr_engine(), image_dir, chapter, start, end_key)
            )
            post_option_explanation = detect_explanation_after_options(
                start,
                end_key,
                lines_by_page,
                image_dir,
            )
            explanation_candidates = [
                item
                for item in (
                    ocr_explanation,
                    visual_explanation,
                    post_option_explanation,
                )
                if item is not None
            ]
            explanation = (
                min(explanation_candidates, key=lambda item: int(item["key"]))
                if explanation_candidates
                else fallback_explanation(end_key)
            )

        start_line: OcrLine = start["line"]
        anchor = anchors_by_number[int(start["number"])]
        explanation_line: OcrLine = explanation["line"]
        question_start = Point(anchor.page, anchor.y)
        question_end = Point(explanation["page"], max(BODY_TOP, explanation_line.y1 - 8))
        explanation_start = Point(explanation["page"], max(BODY_TOP, explanation_line.y1 - 8))

        if next_start:
            next_anchor = anchors_by_number[int(next_start["number"])]
            explanation_end = Point(next_anchor.page, max(BODY_TOP, next_anchor.y - 12))
        else:
            explanation_end = Point(len(page_paths), BODY_BOTTOM)

        question_number = int(start["number"])
        crop_x = anchor.x
        question_segment_bottoms = {
            int(page): int(y)
            for page, y in manual_segment_bottoms.get(question_number, {}).items()
        }

        questions.append(
            ImageQuestion(
                id=f"{bank_id}-{chapter_slug}-pdf-{start['number']:04d}",
                bankId=chapter["bankId"],
                bankTitle=chapter["bankTitle"],
                chapterId=chapter["chapterId"],
                chapterTitle=chapter["chapterId"],
                number=question_number,
                answer=str(start["answer"]),
                sourceFile=chapter["sourceFile"],
                questionSegments=make_segments(
                    bank_id,
                    chapter_slug,
                    question_start,
                    question_end,
                    page_width,
                    page_height,
                    crop_x=crop_x,
                    continuation_crop_x=crop_x,
                    image_dir=image_dir,
                    lines_by_page=lines_by_page,
                    segment_bottoms=question_segment_bottoms,
                    safe_bottom_pad=10,
                ),
                explanationSegments=make_segments(
                    bank_id,
                    chapter_slug,
                    explanation_start,
                    explanation_end,
                    page_width,
                    page_height,
                    image_dir=image_dir,
                    lines_by_page=lines_by_page,
                    safe_bottom_pad=SEGMENT_SAFE_BOTTOM_PAD,
                ),
                answerMask=None,
            )
        )

    return {
        "bankId": chapter["bankId"],
        "bankTitle": chapter["bankTitle"],
        "chapterId": chapter["chapterId"],
        "chapterTitle": chapter["chapterId"],
        "chapterSlug": chapter_slug,
        "sourceFile": chapter["sourceFile"],
        "questionCount": len(questions),
        "questions": [
            {
                **asdict(question),
                "questionSegments": [asdict(segment) for segment in question.questionSegments],
                "explanationSegments": [asdict(segment) for segment in question.explanationSegments],
                "answerMask": asdict(question.answerMask) if question.answerMask else None,
            }
            for question in questions
        ],
    }


def main() -> None:
    chapters: list[dict[str, Any]] = []
    for index, chapter_config in enumerate(CHAPTERS, start=1):
        print(
            f"[{index}/{len(CHAPTERS)}] {chapter_config['bankTitle']} {chapter_config['chapterId']}",
            flush=True,
        )
        chapters.append(build_chapter(None, chapter_config))
    banks: dict[str, dict[str, Any]] = {}
    for chapter in chapters:
        bank = banks.setdefault(
            chapter["bankId"],
            {
                "bankId": chapter["bankId"],
                "bankTitle": chapter["bankTitle"],
                "chapters": [],
            },
        )
        bank["chapters"].append(chapter)

    DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
    DATA_OUT.write_text(
        json.dumps(
            {"banks": list(banks.values())},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote {DATA_OUT}")
    for chapter in chapters:
        print(f"{chapter['chapterTitle']}: {chapter['questionCount']} questions")


if __name__ == "__main__":
    main()
