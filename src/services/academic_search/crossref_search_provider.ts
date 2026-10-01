import {
  AcademicSearchProvider,
  AcademicSearchResponse,
  AcademicSearchResultItem,
  SearchFilters,
} from "./academic_search_types";

/**
 * Strips HTML / JATS XML tags commonly returned in Crossref abstracts
 */
function cleanAbstractText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<jats:title>[^<]*<\/jats:title>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Curated offline fallback papers clearly marked as DEMO DATA if external network is unavailable
 */
const DEMO_FALLBACK_PAPERS: AcademicSearchResultItem[] = [
  {
    title: "Swin UNETR: Swin Transformers for Semantic Segmentation of Brain Tumors in MRI Images",
    authors: ["Ali Hatamizadeh", "Vishwesh Nath", "Yucheng Tang", "Dong Yang", "Holger R. Roth", "Daguang Xu"],
    year: 2022,
    venue: "IEEE Transactions on Medical Imaging (TMI)",
    doi: "10.1109/TMI.2022.3168270",
    abstract: "We introduce Swin UNETR, a novel architecture that redefines 3D medical image segmentation by utilizing hierarchical Swin Transformer blocks as an encoder directly connected to a CNN-based decoder via skip connections. Evaluated on the BraTS 21 dataset.",
    externalUrl: "https://doi.org/10.1109/TMI.2022.3168270",
    sourceProvider: "demo",
    isDemo: true,
    citationCount: 480,
    relevanceScore: 0.98,
    methodology: "Hierarchical Shifted-Window Transformer + U-Net Skip Decoder",
    datasets: ["BraTS 2021", "BTCV Multi-Organ CT"],
    tags: ["Medical Image Segmentation", "Vision Transformers", "3D MRI"],
  },
  {
    title: "nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation",
    authors: ["Fabian Isensee", "Paul F. Jaeger", "Peter M. Kohl", "Jens Petersen", "Klaus H. Maier-Hein"],
    year: 2021,
    venue: "Nature Methods",
    doi: "10.1038/s41592-020-01008-z",
    abstract: "Biomedical image segmentation algorithms often struggle to generalize across datasets. We present nnU-Net, a robust self-configuring deep learning framework that automatically adapts preprocessing, network architecture, training scheme, and post-processing.",
    externalUrl: "https://doi.org/10.1038/s41592-020-01008-z",
    sourceProvider: "demo",
    isDemo: true,
    citationCount: 3100,
    relevanceScore: 0.95,
    methodology: "Self-Configuring 2D & 3D U-Net Ensemble with Rule-Based Meta-Parameter Adaptation",
    datasets: ["Medical Segmentation Decathlon (MSD)", "Synapse"],
    tags: ["Deep Learning", "Biomedical Segmentation", "Self-Configuring"],
  },
  {
    title: "TransUNet: Transformers Make Strong Encoders for Medical Image Segmentation",
    authors: ["Jieneng Chen", "Yongyi Lu", "Qihang Yu", "Xiangde Luo", "Ehsan Adeli", "Yan Wang", "Le Lu", "Alan L. Yuille", "Yuyin Zhou"],
    year: 2021,
    venue: "arXiv preprint arXiv:2102.04306",
    doi: "10.48550/arXiv.2102.04306",
    abstract: "Medical image segmentation is a cornerstone for computer-aided diagnosis. In this work, we propose TransUNet, which merits both Transformers and U-Net, by leveraging self-attention to capture global context while retaining low-level high-resolution CNN features.",
    externalUrl: "https://arxiv.org/abs/2102.04306",
    sourceProvider: "demo",
    isDemo: true,
    citationCount: 1650,
    relevanceScore: 0.92,
    methodology: "Hybrid CNN-Transformer Encoder with Cascaded Upsampler (CUP) Decoder",
    datasets: ["Synapse Multi-Organ CT", "ACDC Cardiac MRI"],
    tags: ["Medical Imaging", "Transformers", "CNN-Transformer Hybrid"],
  },
  {
    title: "UNETR: Transformers for 3D Medical Image Segmentation",
    authors: ["Ali Hatamizadeh", "Dong Yang", "Holger R. Roth", "Daguang Xu"],
    year: 2022,
    venue: "IEEE/CVF Winter Conference on Applications of Computer Vision (WACV)",
    doi: "10.1109/WACV51458.2022.00062",
    abstract: "We introduce UNETR, a novel architecture utilizing a pure transformer as the encoder to learn sequence representations of the input volume and effectively capture global multi-scale information.",
    externalUrl: "https://doi.org/10.1109/WACV51458.2022.00062",
    sourceProvider: "demo",
    isDemo: true,
    citationCount: 920,
    relevanceScore: 0.89,
    methodology: "Pure Vision Transformer (ViT) 3D Encoder with Deconvolutional Upsampling",
    datasets: ["BTCV Multi-Organ", "BraTS 2021"],
    tags: ["3D Segmentation", "Vision Transformers", "Computed Tomography"],
  },
];

export class CrossrefSearchProvider implements AcademicSearchProvider {
  readonly name = "crossref";

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
    let crossrefUrl = `https://api.crossref.org/works?query=${encodeURIComponent(
      cleanQuery
    )}&rows=${limit}&select=DOI,title,author,published,container-title,abstract,URL,is-referenced-by-count`;

    // Filter by year if provided
    if (filters.year) {
      crossrefUrl += `&filter=from-pub-date:${filters.year}-01-01,until-pub-date:${filters.year}-12-31`;
    } else if (filters.fromYear) {
      crossrefUrl += `&filter=from-pub-date:${filters.fromYear}-01-01`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const contactEmail = process.env.CROSSREF_MAILTO || "research@edupye.com";
      const res = await fetch(crossrefUrl, {
        headers: {
          "User-Agent": `EduPyeResearcher/1.0 (mailto:${contactEmail})`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Crossref API responded with status ${res.status}`);
      }

      const data = await res.json();
      const items = data?.message?.items || [];
      const totalResults = data?.message?.["total-results"] || items.length;

      const papers: AcademicSearchResultItem[] = items.map((item: any) => {
        const title = Array.isArray(item.title) && item.title.length > 0
          ? item.title[0]
          : "Untitled Research Paper";

        const authors = Array.isArray(item.author)
          ? item.author.map((a: any) => {
              const given = a.given ? `${a.given} ` : "";
              const family = a.family || "";
              return `${given}${family}`.trim();
            }).filter(Boolean)
          : [];

        const year =
          item.published?.["date-parts"]?.[0]?.[0] ||
          item.created?.["date-parts"]?.[0]?.[0];

        const venue =
          Array.isArray(item["container-title"]) && item["container-title"].length > 0
            ? item["container-title"][0]
            : "Academic Journal / Conference";

        const rawAbstract = item.abstract || "";
        const abstract = cleanAbstractText(rawAbstract) ||
          "No abstract provided by publisher indexing. Full metadata and citation record available.";

        const doi = item.DOI;
        const externalUrl = item.URL || (doi ? `https://doi.org/${doi}` : undefined);
        const citationCount = item["is-referenced-by-count"] || 0;

        return {
          title,
          authors: authors.length > 0 ? authors : ["Unknown Authors"],
          year,
          venue,
          abstract,
          doi,
          externalUrl,
          sourceProvider: "crossref",
          isDemo: false,
          citationCount,
          relevanceScore: 0.9,
          tags: ["Academic Research", venue].filter(Boolean),
        };
      });

      if (papers.length > 0) {
        return {
          query: cleanQuery,
          total: totalResults,
          papers,
          provider: "Crossref (Live Academic Index)",
          isDemo: false,
        };
      }
    } catch (err: any) {
      console.warn("Crossref live academic search failed/timed out, using labeled demo fallback:", err?.message || err);
    }

    // Curated fallback labeled strictly as DEMO DATA
    const matched = DEMO_FALLBACK_PAPERS.filter(
      (p) =>
        p.title.toLowerCase().includes(cleanQuery.toLowerCase()) ||
        p.abstract.toLowerCase().includes(cleanQuery.toLowerCase()) ||
        p.tags?.some((t) => t.toLowerCase().includes(cleanQuery.toLowerCase()))
    );

    const papers = matched.length > 0 ? matched : DEMO_FALLBACK_PAPERS;

    return {
      query: cleanQuery,
      total: papers.length,
      papers,
      provider: "Demo Fallback (Offline Index)",
      isDemo: true,
    };
  }
}
