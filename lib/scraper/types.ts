export type Strategy = 'json_ld' | 'og_meta' | 'llm'

export interface ProductData {
  price:          number
  original_price: number | null
  currency:       string | null
  in_stock:       boolean | null
  name:           string | null
  image_url:      string | null
}

export interface SiteStrategy {
  strategy: Strategy
  needs_js: boolean
}
