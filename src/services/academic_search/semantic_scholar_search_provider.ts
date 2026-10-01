import {
  AcademicSearchProvider,
  AcademicSearchResponse,
  AcademicSearchResultItem,
  SearchFilters,
} from "./academic_search_types";

export class SemanticScholarSearchProvider implements AcademicSearchProvider {
  readonly name = "semanticscholar";

  async searchPapers(
    query: string,
    filters: SearchFilters = {}
  ): Promise<AcademicSearchResponse> {
    const cleanQuery = query?.trim();
    if (!cleanQuery) {
      return {
        query: "",
        total: 0,
        papers: [],
        provider: this.name,
        isDemo: false,
      };
    }

    const limit = Math.min(Math.max(filters.limit || 10, 1), 25);
    const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;

    let url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
      cleanQuery
    )}&limit=${limit}&fields=title,authors,year,venue,abstract,externalIds,citationCount,openAccessPdf`;

    if (filters.year) {
      url += `&year=${filters.year}`;
    } else if (filters.fromYear) {
      url += `&year=${filters.fromYear}-${filters.toYear || new Date().getFullYear()}`;
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "EduPyeResearcher/1.0",
    };

    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Semantic Scholar API responded with HTTP ${res.status}`);
      }

      const data = await res.json();
      const items = data?.data || [];
      const total = data?.total || items.length;

      const papers: AcademicSearchResultItem[] = items.map((item: any) => {
        const title = item.title || "Untitled Paper";
        const authors = Array.isArray(item.authors)
          ? item.authors.map((a: any) => a.name).filter(Boolean)
          : [];
        const year = item.year;
        const venue = item.venue || "Academic Publication";
        const abstract = item.abstract || "No abstract provided in registry record.";
        const doi = item.externalIds?.DOI;
        const arxivId = item.externalIds?.ArXiv;
        const externalUrl =
          item.openAccessPdf?.url ||
          (doi ? `https://doi.org/${doi}` : arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined);

        return {
          id: item.paperId,
          title,
          authors: authors.length > 0 ? authors : ["Unknown Authors"],
          year,
          venue,
          abstract,
          doi,
          arxivId,
          externalUrl,
          pdfUrl: item.openAccessPdf?.url,
          sourceProvider: "semanticscholar",
          isDemo: false,
          citationCount: item.citationCount || 0,
          relevanceScore: 0.95,
          tags: ["Peer-Reviewed", venue].filter(Boolean),
        };
      });

      return {
        query: cleanQuery,
        total,
        papers,
        provider: "Semantic Scholar (AI2 Academic Graph)",
        isDemo: false,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  }
}
