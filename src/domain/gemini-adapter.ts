/**
 * Obywatel - Optional Gemini AI Cloud Adapter with Strict Disclosure & Redaction
 * Conforms to docs/PRIVACY.md, docs/TOOLS.md, and Requirement 11:
 * "Gemini API jest opcjonalne. Przed wywołaniem aplikacja pokazuje dokładny zakres danych,
 * odbiorcę i cel. Użytkownik może zredagować dane. Zgoda dotyczy konkretnej operacji i payloadu."
 */

import { computeSha256 } from './crypto';
import { GeminiDisclosurePayload } from './types';

export interface GeminiAdapterConfig {
  aiEnabled: boolean;
  apiKey?: string;
  model: string;
  timeoutMs: number;
}

export const DEFAULT_GEMINI_CONFIG: GeminiAdapterConfig = {
  aiEnabled: false,
  apiKey: undefined,
  model: 'gemini-1.5-flash',
  timeoutMs: 15000,
};

export class GeminiAdapter {
  private config: GeminiAdapterConfig;

  constructor(config: Partial<GeminiAdapterConfig> = {}) {
    this.config = { ...DEFAULT_GEMINI_CONFIG, ...config };
  }

  /**
   * Tworzy transparentny podgląd danych (Disclosure Preview),
   * pozwalając użytkownikowi zapoznać się z każdym polem i ewentualnie je zredagować.
   */
  public prepareDisclosure(params: {
    operationName: string;
    purpose: string;
    fields: { field: string; value: string; isRequired?: boolean }[];
  }): GeminiDisclosurePayload {
    const dataScope = params.fields.map((f) => ({
      field: f.field,
      value: f.value,
      isRedacted: false,
      isRequired: Boolean(f.isRequired),
    }));

    const cleanPayload: Record<string, string> = {};
    dataScope.forEach((item) => {
      cleanPayload[item.field] = item.isRedacted ? '[ZREDAGOWANO]' : item.value;
    });

    return {
      operationName: params.operationName,
      recipient: 'Google Gemini API (Google Cloud / Vertex AI)',
      targetEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      purpose: params.purpose,
      dataScope,
      exactJsonPayload: JSON.stringify(cleanPayload, null, 2),
      userConsentGranted: false,
    };
  }

  /**
   * Wykonanie zapytania do API wyłącznie po zatwierdzeniu zgody przez użytkownika.
   */
  public async executeWithConsent(
    disclosure: GeminiDisclosurePayload,
    userGrantedConsent: boolean
  ): Promise<{ success: boolean; resultText?: string; error?: string; payloadHash: string }> {
    const payloadHash = await computeSha256(disclosure.exactJsonPayload);

    if (!userGrantedConsent) {
      return {
        success: false,
        error: 'Operacja została zablokowana: brak wyraźnej i świadomej zgody użytkownika na przesłanie danych do chmury.',
        payloadHash,
      };
    }

    if (!this.config.aiEnabled) {
      return {
        success: false,
        error: 'Adapter Gemini jest wyłączony w konfiguracji aplikacji (AI_ENABLED=false). Aplikacja działa w trybie w 100% lokalnym.',
        payloadHash,
      };
    }

    if (!this.config.apiKey) {
      return {
        success: false,
        error: 'Brak skonfigurowanego klucza API dla Gemini. Dane nie opuściły Twojego komputera.',
        payloadHash,
      };
    }

    // Ten adapter nie wykonuje udawanego „sukcesu”. Realne wywołanie Gemini
    // wymaga osobnego, serwerowego endpointu z kontrolą kosztu, retencji,
    // logowania zgody i walidacją odpowiedzi; do tego czasu blokujemy wysyłkę.
    return {
      success: false,
      error: 'Wysyłka do Gemini nie jest jeszcze aktywna. Ten tryb chroni dane przed pozornym lub nieaudytowanym wywołaniem chmury.',
      payloadHash,
    };
  }
}
