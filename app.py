"""Interface Streamlit do PDF AI Extractor."""

import os
from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from pdf_ai_extractor.export import as_table_rows, to_csv_bytes, to_json_bytes
from pdf_ai_extractor.fields import parse_fields
from pdf_ai_extractor.gemini_client import (
    DEFAULT_MODEL,
    GeminiConfigError,
    GeminiResponseError,
    extract_fields,
    resolve_api_key,
    resolve_model,
)
from pdf_ai_extractor.pdf_reader import extract_text

load_dotenv()

st.set_page_config(page_title="PDF AI Extractor", page_icon="📄", layout="wide")

st.title("PDF AI Extractor")
st.caption(
    "Envie um PDF com texto, diga quais campos quer e receba um JSON validado. "
    "A leitura do arquivo é local. A IA usa a cota gratuita do Google Gemini."
)

with st.sidebar:
    st.header("Gemini")
    st.text_input(
        "Chave da API",
        type="password",
        key="api_key_input",
        help="Chave gratuita do Google AI Studio. Ela fica só nesta sessão e não é gravada no código.",
    )
    env_key_present = bool(os.getenv("GEMINI_API_KEY", "").strip())
    if env_key_present:
        st.success("Também há uma chave em GEMINI_API_KEY. O campo acima tem prioridade se for preenchido.")
    else:
        st.info("Sem chave no ambiente. Cole a chave aqui ou crie um arquivo .env a partir de .env.example.")
    st.text_input("Modelo", value=DEFAULT_MODEL, key="model_input")
    st.caption("Mantenha gemini-3.8-flash para usar a cota gratuita.")

uploaded = st.file_uploader("PDF", type=["pdf"])
fields_raw = st.text_area(
    "Campos para extrair",
    height=180,
    placeholder="nome: nome completo da pessoa\ncpf\ndata\nvalor: valor total em reais",
    help="Um campo por linha. Opcionalmente, escreva nome: descrição para orientar a extração.",
)

extract_clicked = st.button("Extrair informações", type="primary")

if extract_clicked:
    if uploaded is None:
        st.warning("Envie um arquivo PDF.")
    else:
        try:
            specs = parse_fields(fields_raw)
            pdf = extract_text(uploaded.getvalue())
        except ValueError as exc:
            st.error(str(exc))
        else:
            if pdf.truncated:
                st.warning(
                    f"O texto foi limitado a {pdf.char_count} caracteres "
                    "para caber na cota gratuita."
                )
            st.write(
                f"**{uploaded.name}** — {pdf.page_count} página(s), "
                f"{pdf.char_count} caracteres de texto."
            )
            api_key = resolve_api_key(st.session_state.get("api_key_input", ""))
            model = resolve_model(st.session_state.get("model_input", ""))
            try:
                with st.spinner("Lendo o texto e consultando o Gemini..."):
                    result = extract_fields(pdf.text, specs, api_key=api_key, model=model)
            except (GeminiConfigError, GeminiResponseError) as exc:
                st.error(str(exc))
            else:
                stem = Path(uploaded.name).stem or "extracao"
                st.session_state["result"] = result
                st.session_state["json_name"] = f"{stem}.json"
                st.session_state["csv_name"] = f"{stem}.csv"

result = st.session_state.get("result")
if result:
    st.subheader("Resultado")
    st.dataframe(as_table_rows(result), use_container_width=True, hide_index=True)
    json_col, csv_col = st.columns(2)
    with json_col:
        st.download_button(
            "Baixar JSON",
            data=to_json_bytes(result),
            file_name=st.session_state.get("json_name", "extracao.json"),
            mime="application/json",
        )
    with csv_col:
        st.download_button(
            "Baixar CSV",
            data=to_csv_bytes(result),
            file_name=st.session_state.get("csv_name", "extracao.csv"),
            mime="text/csv",
        )
    with st.expander("JSON"):
        st.json(result)
