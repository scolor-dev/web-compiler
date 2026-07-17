use crate::{Diagnostic, ExecuteResult};

/// Performs the checks that are safe and deterministic in WASM. JavaScript is
/// evaluated by the isolated browser Worker after this succeeds.
pub fn validate(source: &str) -> ExecuteResult {
    if source.trim().is_empty() {
        return ExecuteResult::failure(Diagnostic::error("コードが空です", 1, 1));
    }

    let mut stack: Vec<(char, usize, usize)> = Vec::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;
    let mut line = 1;
    let mut column = 0;
    let chars: Vec<char> = source.chars().collect();
    let mut index = 0;
    let mut line_comment = false;
    let mut block_comment = false;

    while index < chars.len() {
        let ch = chars[index];
        column += 1;
        if ch == '\n' {
            line += 1;
            column = 0;
            line_comment = false;
            index += 1;
            continue;
        }
        if line_comment {
            index += 1;
            continue;
        }
        if block_comment {
            if ch == '*' && chars.get(index + 1) == Some(&'/') {
                block_comment = false;
                index += 2;
                column += 1;
            } else {
                index += 1;
            }
            continue;
        }
        if let Some(active) = quote {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == active {
                quote = None;
            }
            index += 1;
            continue;
        }
        if ch == '/' && chars.get(index + 1) == Some(&'/') {
            line_comment = true;
            index += 2;
            column += 1;
            continue;
        }
        if ch == '/' && chars.get(index + 1) == Some(&'*') {
            block_comment = true;
            index += 2;
            column += 1;
            continue;
        }
        if matches!(ch, '\'' | '"' | '`') {
            quote = Some(ch);
            index += 1;
            continue;
        }
        if matches!(ch, '(' | '[' | '{') {
            stack.push((ch, line, column));
        }
        if matches!(ch, ')' | ']' | '}') {
            let expected = match ch {
                ')' => '(',
                ']' => '[',
                _ => '{',
            };
            match stack.pop() {
                Some((open, _, _)) if open == expected => {}
                _ => {
                    return ExecuteResult::failure(Diagnostic::error(
                        format!("対応する開き括弧がない `{ch}` です"),
                        line,
                        column,
                    ));
                }
            }
        }
        index += 1;
    }
    if quote.is_some() {
        return ExecuteResult::failure(Diagnostic::error(
            "文字列リテラルが閉じられていません",
            line,
            column.max(1),
        ));
    }
    if block_comment {
        return ExecuteResult::failure(Diagnostic::error(
            "ブロックコメントが閉じられていません",
            line,
            column.max(1),
        ));
    }
    if let Some((ch, open_line, open_column)) = stack.pop() {
        return ExecuteResult::failure(Diagnostic::error(
            format!("括弧 `{ch}` が閉じられていません"),
            open_line,
            open_column,
        ));
    }
    ExecuteResult::success(String::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catches_unclosed_bracket() {
        assert_eq!(validate("console.log((1)").exit_code, 1);
    }
    #[test]
    fn accepts_valid_source() {
        assert_eq!(validate("console.log('ok')").exit_code, 0);
    }
}
