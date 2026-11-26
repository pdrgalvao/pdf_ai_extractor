# PDF AI Extractor

Aplicação local que lê o texto de um PDF, pede ao Google Gemini os campos que você indicar e devolve o resultado em tabela, JSON e CSV.

A leitura do PDF acontece na sua máquina. A chave da API não fica no código: use a variável `GEMINI_API_KEY` ou cole a chave na barra lateral (ela permanece só na sessão).

O modelo padrão é `gemini-3.8-flash`, que tem cota gratuita no Google AI Studio. Não é necessário conta paga nem a API da OpenAI.

## Preparar

1. Crie uma chave gratuita em [Google AI Studio](https://aistudio.google.com/apikey).
2. Na pasta do projeto:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
copy .env.example .env
```

3. Abra `.env` e cole a chave em `GEMINI_API_KEY`.

## Executar

```powershell
.\.venv\Scripts\Activate.ps1
python -m streamlit run app.py
```

## Campos

Um campo por linha. A descrição depois dos dois-pontos orienta a IA:

```text
nome: nome completo da pessoa
cpf
data
valor: valor total em reais
```

Se o dado não estiver no texto, o campo volta vazio (`null` no JSON). PDFs que são apenas imagem não têm texto selecionável; esta versão não faz OCR.

## Testes

```powershell
python -m pytest
```

Os testes geram um PDF em memória e validam o JSON sem chamar o Gemini.
