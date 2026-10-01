import {
  AcademicSearchProvider,
  AcademicSearchResponse,
  SearchFilters,
} from "./academic_search_types";
import { CrossrefSearchProvider } from "./crossref_search_provider";
import { SemanticScholarSearchProvider } from "./semantic_scholar_search_provider";

export * from "./academic_search_types";
export * from "./crossref_search_provider";
export * from "./semantic_scholar_search_provider";

const crossrefProvider = new CrossrefSearchProvider();
const semanticScholarProvider = new SemanticScholarSearchProvider();

/**
 * Resilient multi-provider search strategy:
 * - Uses configured provider (or Crossref by default, requiring 0 API keys and providing CC0 data in polite pool).
 * - If SEMANTIC_SCHOLAR_API_KEY is configured in backend environment, Semantic Scholar can be chosen.
 * - If the primary provider encounters a rate limit (HTTP 429) or network timeout, automatically fails over.
 */
class ResilientAcademicSearchService implements AcademicSearchProvider {
  readonly name = "resilient-academic-search";

  async searchPapers(
    query: string,
    filters?: SearchFilters
  ): Promise<AcademicSearchResponse> {
    const preferred = (process.env.ACADEMIC_SEARCH_PROVIDER || "").toLowerCase();
    const hasS2Key = Boolean(process.env.SEMANTIC_SCHOLAR_API_KEY);

    // Primary selection logic
    const primary =
      preferred === "semanticscholar" || (hasS2Key && preferred !== "crossref")
        ? semanticScholarProvider
        : crossrefProvider;

    const fallback =
      primary === semanticScholarProvider ? crossrefProvider : semanticScholarProvider;

    try {
      return await primary.searchPapers(query, filters);
    } catch (primaryErr: any) {
      console.warn(
        `Primary academic provider (${primary.name}) failed: ${primaryErr?.message}. Failing over to ${fallback.name}...`
      );

      try {
        return await fallback.searchPapers(query, filters);
      } catch (fallbackErr: any) {
        console.warn(
          `Fallback academic provider (${fallback.name}) also failed: ${fallbackErr?.message}. Returning labeled demo fallback.`
        );
        // Delegate to Crossref's curated labeled demo fallback
        return crossrefProvider.searchPapers(query, filters);
      }
    }
  }
}

const resilientService: AcademicSearchProvider = new ResilientAcademicSearchService();

export function getAcademicSearchProvider(): AcademicSearchProvider {
  return resilientService;
}
