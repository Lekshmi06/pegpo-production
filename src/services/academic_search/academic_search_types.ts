export interface SearchFilters {
  year?: number;
  fromYear?: number;
  toYear?: number;
  venue?: string;
  author?: string;
  domain?: string;
  openAccess?: boolean;
  limit?: number;
}

export interface AcademicSearchResultItem {
  id?: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  abstract: string;
  doi?: string;
  arxivId?: string;
  externalUrl?: string;
  pdfUrl?: string;
  sourceProvider: "crossref" | "arxiv" | "semanticscholar" | "demo";
  isDemo: boolean;
  citationCount?: number;
  relevanceScore?: number;
  tags?: string[];
  methodology?: string;
  datasets?: string[];
}

export interface AcademicSearchResponse {
  query: string;
  total: number;
  papers: AcademicSearchResultItem[];
  provider: string;
  isDemo: boolean;
}

export interface AcademicSearchProvider {
  readonly name: string;
  searchPapers(
    query: string,
    filters?: SearchFilters
  ): Promise<AcademicSearchResponse>;
}
