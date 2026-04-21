import { GoogleGenAI, Type } from "@google/genai";
import { Asset, User } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function queryAssetData(query: string, assets: Asset[]) {
  try {
    const context = `
      Você é um assistente de BI para um sistema de Gerenciamento de Ativos Imobilizados.
      Abaixo estão os dados atuais dos ativos (resumo):
      Total de Ativos: ${assets.length}
      Ativos Ativos: ${assets.filter(a => a.status === 'ATIVO').length}
      Ativos Baixados: ${assets.filter(a => a.status === 'BAIXADO').length}
      
      Estrutura de um Ativo (exemplo):
      - name: nome do item
      - acquisitionValueBRL: valor de compra
      - acquisitionDate: data de compra (YYYY-MM-DD)
      - costCenterDescription: centro de custo
      - accountDescription: conta contábil
      - branchName: filial
      - status: status atual (ATIVO, BAIXADO, etc)
      
      Dados detalhados (JSON):
      ${JSON.stringify(assets.map(a => ({
        id: a.id,
        nome: a.name,
        valor: a.acquisitionValueBRL,
        data: a.acquisitionDate,
        cc: a.costCenterDescription,
        conta: a.accountDescription,
        filial: a.branchName,
        status: a.status
      })), null, 2)}

      Pergunta do Usuário: "${query}"

      REGRAS:
      1. Responda de forma direta e profissional.
      2. Se for um cálculo (soma, média), mostre o resultado formatado em R$ ou $.
      3. Se for uma lista, enumere os itens.
      4. Use os dados fornecidos acima. Não invente dados.
      5. Responda em Português Brasileiro.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: context,
    });

    return response.text || "Não foi possível obter uma resposta.";
  } catch (error) {
    console.error("Erro na consulta IA:", error);
    return "Desculpe, tive um problema ao processar sua consulta. Certifique-se de que a chave da API está configurada.";
  }
}

export async function getExecutiveSummary(user: User, assets: Asset[], movements: any[]) {
  try {
    const context = `
      Você é um Consultor de Patrimônio Sênior. Sua tarefa é analisar a base de dados de ativos imobilizados e fornecer um "Resumo Executivo" para o usuário logado.
      
      USUÁRIO LOGADO:
      - Nome: ${user.name}
      - Papel/Função: ${user.role}
      
      MÉTODOS DE ANÁLISE:
      1. Identifique riscos imediatos (manutenções atrasadas, seguros vencidos).
      2. Analyze a saúde financeira (valor contábil vs valor de aquisição).
      3. Verifique anomalias em movimentações recentes.
      4. Sugira ações preventivas.

      DADOS ATUAIS:
      - Ativos: ${JSON.stringify(assets.map(a => ({
        nome: a.name,
        cc: a.costCenterDescription,
        status: a.status,
        seguroVenc: a.insurance?.endDate,
        maintProx: a.maintenance?.nextMaintenanceDate,
        valorCont: a.acquisitionValueBRL // Simplified
      })))}
      
      REGRAS DE FORMATAÇÃO:
      - Resposta em Português.
      - Use tom executivo, direto e acionável.
      - Divida em: "Destaques Positivos", "Pontos de Atenção" e "Sugestão de Ações".
      - Máximo de 300 palavras.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: context,
    });

    return response.text;
  } catch (error) {
    console.error("Erro no resumo executivo IA:", error);
    return null;
  }
}

export async function extractInvoiceData(base64Data: string, mimeType: string) {
  try {
    const prompt = `
      Analise esta Imagem/PDF de Nota Fiscal (DANFE) e extraia os seguintes dados estruturados.
      Campos necessários:
      - denominação: Nome/Descrição do produto principal ou serviço.
      - ncm: Código NCM (Nomenclatura Comum do Mercosul).
      - valor: Valor total do item ou valor da nota (em número).
      - fornecedor: Razão Social ou Nome Fantasia do Emitente/Fornecedor.

      Se houver múltiplos itens, extraia o de maior valor ou o principal.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { data: base64Data, mimeType } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            denomination: { type: Type.STRING },
            ncm: { type: Type.STRING },
            value: { type: Type.NUMBER },
            supplier: { type: Type.STRING }
          },
          required: ["denomination", "ncm", "value", "supplier"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text);
    }
    return null;
  } catch (error) {
    console.error("Erro no OCR da NF:", error);
    throw error;
  }
}

export async function chatWithAI(user: User, query: string, history: { role: 'user' | 'model', parts: { text: string }[] }[], assets: Asset[], movements: any[]) {
  try {
    const systemInstruction = `
      Você é o "Asset - Assistente Virtual", um assistente especializado em gestão de ativos imobilizados.
      Você atua como um manual interativo e consultor de dados.
      
      USUÁRIO LOGADO:
      - Nome: ${user.name}
      - Papel/Função: ${user.role}
      
      CONTEXTO DO SISTEMA:
      - O usuário pode cadastrar ativos, realizar movimentações, baixas, inventários e coletar dados via QR Code.
      - Você tem acesso aos dados atuais para responder perguntas específicas.
      - Se o usuário perguntar "como faço tal coisa", explique o fluxo no sistema (Menus: Dashboard, Ativos, Coletor, Inventário, Movimentações, Configurações).
      
      DADOS DOS ATIVOS:
      Total: ${assets.length} ativos.
      
      REGRAS:
      1. Seja amigável, profissional e direto.
      2. Responda em Português Brasileiro.
      3. Se a informação não estiver disponível nos dados ou no contexto do sistema, admita que não sabe.
      4. Use Markdown para formatar a resposta (negrito, listas, tabelas se necessário).
    `;

    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: systemInstruction,
      },
      history: history,
    });

    const response = await chat.sendMessage({ message: query });
    return response.text;
  } catch (error) {
    console.error("Erro no chat IA:", error);
    return "Desculpe, tive um problema ao processar sua mensagem.";
  }
}
