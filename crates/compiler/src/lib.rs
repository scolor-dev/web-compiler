mod c;
mod javascript;
mod whitespace;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const OUTPUT_LIMIT: usize = 100_000;
const STEP_LIMIT: usize = 1_000_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecuteRequest {
    language: String,
    code: String,
    stdin: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    severity: &'static str,
    message: String,
    line: usize,
    column: usize,
}

impl Diagnostic {
    fn error(message: impl Into<String>, line: usize, column: usize) -> Self {
        Self {
            severity: "error",
            message: message.into(),
            line,
            column,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    stdout: String,
    stderr: String,
    exit_code: i32,
    diagnostics: Vec<Diagnostic>,
}

impl ExecuteResult {
    fn success(stdout: String) -> Self {
        Self {
            stdout,
            stderr: String::new(),
            exit_code: 0,
            diagnostics: vec![],
        }
    }

    fn failure(diagnostic: Diagnostic) -> Self {
        let stderr = format!(
            "{}:{}: {}",
            diagnostic.line, diagnostic.column, diagnostic.message
        );
        Self {
            stdout: String::new(),
            stderr,
            exit_code: 1,
            diagnostics: vec![diagnostic],
        }
    }
}

#[wasm_bindgen]
pub fn execute(request: &str) -> String {
    let response = match serde_json::from_str::<ExecuteRequest>(request) {
        Ok(request) => match request.language.as_str() {
            "c" => c::run(&request.code, &request.stdin),
            "whitespace" => whitespace::run(&request.code, &request.stdin),
            "javascript" => javascript::validate(&request.code),
            _ => ExecuteResult::failure(Diagnostic::error("未対応の言語です", 1, 1)),
        },
        Err(error) => ExecuteResult::failure(Diagnostic::error(
            format!("実行リクエストが不正です: {error}"),
            1,
            1,
        )),
    };
    serde_json::to_string(&response).expect("result serialization must succeed")
}

#[wasm_bindgen]
pub fn lint(request: &str) -> String {
    let response = match serde_json::from_str::<ExecuteRequest>(request) {
        Ok(request) => match request.language.as_str() {
            "c" => c::lint(&request.code),
            "whitespace" => whitespace::lint(&request.code),
            "javascript" => javascript::validate(&request.code),
            _ => ExecuteResult::failure(Diagnostic::error("未対応の言語です", 1, 1)),
        },
        Err(error) => ExecuteResult::failure(Diagnostic::error(
            format!("Lintリクエストが不正です: {error}"),
            1,
            1,
        )),
    };
    serde_json::to_string(&response).expect("result serialization must succeed")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_language() {
        let result = execute(r#"{"language":"ruby","code":"","stdin":""}"#);
        assert!(result.contains("未対応"));
    }
}
