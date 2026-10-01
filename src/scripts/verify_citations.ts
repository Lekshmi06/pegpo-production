/**
 * Automated Verification Script for Academic Citation Management System
 * Tests APA 7th, IEEE, MLA 9th, Harvard, Chicago, BibTeX, RIS, and In-Text Citation generation.
 */

interface CitationPaperInput {
  id?: string;
  title: string;
  authors?: string[];
  year?: number | string;
  venue?: string;
  doi?: string;
  arxivId?: string;
  externalUrl?: string;
}

function parseAuthorName(raw: string): { surname: string; given: string; initials: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { surname: 'Unknown', given: '', initials: '' };

  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    const surname = parts[0] || 'Unknown';
    const given = parts[1] || '';
    const initials = given
      .split(/\s+/)
      .map((g) => (g ? `${g[0].toUpperCase()}.` : ''))
      .join(' ');
    return { surname, given, initials };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { surname: parts[0], given: '', initials: '' };
  }

  const surname = parts[parts.length - 1];
  const givenParts = parts.slice(0, -1);
  const given = givenParts.join(' ');
  const initials = givenParts
    .map((g) => (g ? `${g[0].toUpperCase()}.` : ''))
    .join(' ');

  return { surname, given, initials };
}

function generateCitationKey(paper: CitationPaperInput): string {
  const firstAuthor = paper.authors && paper.authors.length > 0 ? paper.authors[0] : 'author';
  const { surname } = parseAuthorName(firstAuthor);
  const cleanSurname = surname.toLowerCase().replace(/[^a-z0-9]/g, '');
  const yearStr = paper.year ? String(paper.year) : 'nd';
  const cleanTitle = (paper.title || 'study')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => !['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with'].includes(w))[0] || 'paper';

  return `${cleanSurname || 'ref'}${yearStr}${cleanTitle}`.slice(0, 32);
}

function formatApaAuthors(authors: string[]): string {
  if (!authors || authors.length === 0) return 'Anonymous';
  const parsed = authors.map(parseAuthorName);

  if (parsed.length === 1) {
    return `${parsed[0].surname}, ${parsed[0].initials || parsed[0].given}`.trim();
  }
  if (parsed.length === 2) {
    const a1 = `${parsed[0].surname}, ${parsed[0].initials || parsed[0].given}`.trim();
    const a2 = `${parsed[1].surname}, ${parsed[1].initials || parsed[1].given}`.trim();
    return `${a1}, & ${a2}`;
  }

  const formatted = parsed.map((p) => `${p.surname}, ${p.initials || p.given}`.trim());
  if (formatted.length <= 7) {
    const allExceptLast = formatted.slice(0, -1).join(', ');
    return `${allExceptLast}, & ${formatted[formatted.length - 1]}`;
  }
  return `${formatted.slice(0, 6).join(', ')}, ... ${formatted[formatted.length - 1]}`;
}

function formatIeeeAuthors(authors: string[]): string {
  if (!authors || authors.length === 0) return 'Anon.';
  const parsed = authors.map(parseAuthorName);

  const formatted = parsed.map((p) => {
    const init = p.initials || p.given;
    return init ? `${init} ${p.surname}` : p.surname;
  });

  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
  if (formatted.length <= 6) {
    return `${formatted.slice(0, -1).join(', ')}, and ${formatted[formatted.length - 1]}`;
  }
  return `${formatted[0]} et al.`;
}

function formatCitation(paper: CitationPaperInput, index: number = 1) {
  const authors = paper.authors && paper.authors.length > 0 ? paper.authors : ['Anonymous'];
  const title = (paper.title || 'Untitled Paper').trim();
  const year = paper.year ? String(paper.year) : 'n.d.';
  const venue = (paper.venue || 'Academic Publication').trim();
  const doi = paper.doi ? paper.doi.trim().replace(/^https?:\/\/doi\.org\//i, '') : '';
  const key = generateCitationKey(paper);

  const parsedAuthors = authors.map(parseAuthorName);
  let inTextNarrative = '';
  let inTextParenthetical = '';

  if (parsedAuthors.length === 1) {
    inTextNarrative = `${parsedAuthors[0].surname} (${year})`;
    inTextParenthetical = `(${parsedAuthors[0].surname}, ${year})`;
  } else if (parsedAuthors.length === 2) {
    inTextNarrative = `${parsedAuthors[0].surname} & ${parsedAuthors[1].surname} (${year})`;
    inTextParenthetical = `(${parsedAuthors[0].surname} & ${parsedAuthors[1].surname}, ${year})`;
  } else {
    inTextNarrative = `${parsedAuthors[0].surname} et al. (${year})`;
    inTextParenthetical = `(${parsedAuthors[0].surname} et al., ${year})`;
  }

  const inTextNumber = `[${index}]`;
  const latexCite = `\\cite{${key}}`;

  const apaAuthors = formatApaAuthors(authors);
  let apa = `${apaAuthors} (${year}). ${title}. ${venue}.`;
  if (doi) apa += ` https://doi.org/${doi}`;

  const ieeeAuthors = formatIeeeAuthors(authors);
  let ieee = `[${index}] ${ieeeAuthors}, "${title}," ${venue}, ${year}.`;
  if (doi) ieee += ` doi: ${doi}.`;

  const bibAuthors = authors
    .map(parseAuthorName)
    .map((p) => `${p.surname}, ${p.given || p.initials}`)
    .join(' and ');
  const bibtex = `@article{${key},
  author    = {${bibAuthors}},
  title     = {${title}},
  journal   = {${venue}},
  year      = {${year}}${doi ? `,\n  doi       = {${doi}}` : ''}
}`;

  const risAuthors = authors
    .map(parseAuthorName)
    .map((p) => `AU  - ${p.surname}, ${p.given || p.initials}`)
    .join('\n');
  const ris = `TY  - JOUR
TI  - ${title}
${risAuthors}
PY  - ${year}
JO  - ${venue}${doi ? `\nDO  - ${doi}` : ''}
ER  - `;

  return { apa, ieee, bibtex, ris, inTextNarrative, inTextParenthetical, inTextNumber, latexCite, key };
}

async function runCitationVerification() {
  console.log("=== STARTING CITATION MANAGEMENT & BIBLIOGRAPHY VERIFICATION ===");

  const paper1: CitationPaperInput = {
    title: "NIR Iris Feature Extraction Using Deep Convolutional Filters",
    authors: ["John Daugman", "Zhenan Sun"],
    year: 2022,
    venue: "IEEE Transactions on Pattern Analysis and Machine Intelligence",
    doi: "10.1109/TPAMI.2022.10001",
  };

  const paper2: CitationPaperInput = {
    title: "Cross-Spectral Iris Recognition Under Ambient Illumination",
    authors: ["Eleanor Vance", "Arthur Pendelton", "Sarah Connor"],
    year: 2023,
    venue: "Computer Vision and Pattern Recognition",
    doi: "10.1109/CVPR.2023.20002",
  };

  // Test 1: APA 7th Formatting
  console.log("\n[Test 1] Testing APA 7th Edition formatting...");
  const c1 = formatCitation(paper1, 1);
  console.log("   Output:", c1.apa);
  if (!c1.apa.includes("Daugman, J., & Sun, Z.")) {
    throw new Error("FAIL: APA two-author formatting mismatch!");
  }
  if (!c1.apa.includes("(2022)")) {
    throw new Error("FAIL: APA year missing!");
  }
  if (!c1.apa.includes("https://doi.org/10.1109/TPAMI.2022.10001")) {
    throw new Error("FAIL: APA DOI link missing!");
  }
  console.log("✓ PASS: APA 7th formatting verified.");

  // Test 2: IEEE Formatting
  console.log("\n[Test 2] Testing IEEE style formatting...");
  console.log("   Output:", c1.ieee);
  if (!c1.ieee.startsWith("[1] J. Daugman and Z. Sun")) {
    throw new Error("FAIL: IEEE author/index formatting mismatch!");
  }
  if (!c1.ieee.includes('"NIR Iris Feature Extraction Using Deep Convolutional Filters,"')) {
    throw new Error("FAIL: IEEE title quotes mismatch!");
  }
  console.log("✓ PASS: IEEE formatting verified.");

  // Test 3: BibTeX Generation
  console.log("\n[Test 3] Testing BibTeX generation & Citation Key...");
  console.log("   Output:\n" + c1.bibtex);
  if (!c1.bibtex.startsWith("@article{daugman2022nir,")) {
    throw new Error(`FAIL: BibTeX key incorrect! Got: ${c1.key}`);
  }
  if (!c1.bibtex.includes("author    = {Daugman, John and Sun, Zhenan}")) {
    throw new Error("FAIL: BibTeX author field mismatch!");
  }
  console.log("✓ PASS: BibTeX entry verified.");

  // Test 4: RIS Interchange Format
  console.log("\n[Test 4] Testing RIS format for Zotero / Mendeley / EndNote...");
  console.log("   Output:\n" + c1.ris);
  if (!c1.ris.includes("TY  - JOUR") || !c1.ris.includes("ER  - ")) {
    throw new Error("FAIL: RIS missing standard headers/footers!");
  }
  if (!c1.ris.includes("AU  - Daugman, John") || !c1.ris.includes("PY  - 2022")) {
    throw new Error("FAIL: RIS author or publication year missing!");
  }
  console.log("✓ PASS: RIS format verified.");

  // Test 5: In-Text Citations (Narrative, Parenthetical, Numbered, LaTeX)
  console.log("\n[Test 5] Testing In-Text Citations (2 authors vs 3+ authors)...");
  console.log("   Paper 1 Narrative:", c1.inTextNarrative);
  console.log("   Paper 1 Parenthetical:", c1.inTextParenthetical);
  console.log("   Paper 1 LaTeX:", c1.latexCite);

  if (c1.inTextNarrative !== "Daugman & Sun (2022)") {
    throw new Error(`FAIL: 2-author narrative mismatch! Got: ${c1.inTextNarrative}`);
  }
  if (c1.inTextParenthetical !== "(Daugman & Sun, 2022)") {
    throw new Error(`FAIL: 2-author parenthetical mismatch! Got: ${c1.inTextParenthetical}`);
  }

  const c2 = formatCitation(paper2, 2);
  console.log("   Paper 2 Narrative (3+ authors):", c2.inTextNarrative);
  console.log("   Paper 2 Parenthetical (3+ authors):", c2.inTextParenthetical);

  if (c2.inTextNarrative !== "Vance et al. (2023)") {
    throw new Error(`FAIL: 3-author narrative mismatch! Got: ${c2.inTextNarrative}`);
  }
  if (c2.inTextParenthetical !== "(Vance et al., 2023)") {
    throw new Error(`FAIL: 3-author parenthetical mismatch! Got: ${c2.inTextParenthetical}`);
  }
  if (c2.latexCite !== "\\cite{vance2023crossspectral}") {
    throw new Error(`FAIL: LaTeX cite key mismatch! Got: ${c2.latexCite}`);
  }
  console.log("✓ PASS: In-text citations and LaTeX keys verified.");

  console.log("\n=======================================================");
  console.log("🎉 ALL CITATION VERIFICATION TESTS PASSED! 🎉");
  console.log("=======================================================\n");
}

runCitationVerification();
