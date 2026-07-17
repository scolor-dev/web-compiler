use crate::{Diagnostic, ExecuteResult, OUTPUT_LIMIT, STEP_LIMIT};
use std::collections::HashMap;

#[derive(Clone, Debug)]
enum Op {
    Push(i64),
    Dup,
    Swap,
    Drop,
    Copy(usize),
    Slide(usize),
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Store,
    Retrieve,
    Label(String),
    Call(String),
    Jump(String),
    JumpZero(String),
    JumpNeg(String),
    Return,
    End,
    OutChar,
    OutNum,
    ReadChar,
    ReadNum,
}

fn visible(ch: char) -> &'static str {
    match ch {
        ' ' => "S",
        '\t' => "T",
        '\n' => "L",
        _ => "?",
    }
}

fn parse_number(tokens: &[char], pos: &mut usize) -> Result<i64, Diagnostic> {
    let sign = *tokens
        .get(*pos)
        .ok_or_else(|| Diagnostic::error("数値の符号がありません", 1, *pos + 1))?;
    *pos += 1;
    let mut value = 0_i64;
    let mut digits = 0;
    while let Some(&ch) = tokens.get(*pos) {
        *pos += 1;
        if ch == '\n' {
            return Ok(if sign == '\t' { -value } else { value });
        }
        value = value
            .checked_mul(2)
            .and_then(|v| v.checked_add(if ch == '\t' { 1 } else { 0 }))
            .ok_or_else(|| Diagnostic::error("数値が大きすぎます", 1, *pos))?;
        digits += 1;
    }
    Err(Diagnostic::error(
        if digits == 0 {
            "数値が終了していません"
        } else {
            "数値の末尾にLFがありません"
        },
        1,
        *pos + 1,
    ))
}

fn parse_label(tokens: &[char], pos: &mut usize) -> Result<String, Diagnostic> {
    let mut label = String::new();
    while let Some(&ch) = tokens.get(*pos) {
        *pos += 1;
        if ch == '\n' {
            return Ok(label);
        }
        label.push_str(visible(ch));
    }
    Err(Diagnostic::error(
        "ラベルの末尾にLFがありません",
        1,
        *pos + 1,
    ))
}

fn take(tokens: &[char], pos: &mut usize) -> Result<char, Diagnostic> {
    let value = tokens
        .get(*pos)
        .copied()
        .ok_or_else(|| Diagnostic::error("命令が途中で終了しています", 1, *pos + 1))?;
    *pos += 1;
    Ok(value)
}

fn parse(source: &str) -> Result<Vec<Op>, Diagnostic> {
    let tokens: Vec<char> = source
        .chars()
        .filter(|c| matches!(c, ' ' | '\t' | '\n'))
        .collect();
    if tokens.is_empty() {
        return Err(Diagnostic::error(
            "Whitespace命令がありません（空白・タブ・改行だけが命令として解釈されます）",
            1,
            1,
        ));
    }
    let mut pos = 0;
    let mut ops = vec![];
    while pos < tokens.len() {
        let a = take(&tokens, &mut pos)?;
        let op = match a {
            ' ' => match take(&tokens, &mut pos)? {
                ' ' => Op::Push(parse_number(&tokens, &mut pos)?),
                '\n' => match take(&tokens, &mut pos)? {
                    ' ' => Op::Dup,
                    '\t' => Op::Swap,
                    '\n' => Op::Drop,
                    _ => unreachable!(),
                },
                '\t' => match take(&tokens, &mut pos)? {
                    ' ' => Op::Copy(parse_number(&tokens, &mut pos)?.max(0) as usize),
                    '\n' => Op::Slide(parse_number(&tokens, &mut pos)?.max(0) as usize),
                    _ => return Err(Diagnostic::error("未知のスタック操作です", 1, pos)),
                },
                _ => unreachable!(),
            },
            '\t' => match take(&tokens, &mut pos)? {
                ' ' => match (take(&tokens, &mut pos)?, take(&tokens, &mut pos)?) {
                    (' ', ' ') => Op::Add,
                    (' ', '\t') => Op::Sub,
                    (' ', '\n') => Op::Mul,
                    ('\t', ' ') => Op::Div,
                    ('\t', '\t') => Op::Mod,
                    _ => return Err(Diagnostic::error("未知の算術命令です", 1, pos)),
                },
                '\t' => match take(&tokens, &mut pos)? {
                    ' ' => Op::Store,
                    '\t' => Op::Retrieve,
                    _ => return Err(Diagnostic::error("未知のヒープ命令です", 1, pos)),
                },
                '\n' => match (take(&tokens, &mut pos)?, take(&tokens, &mut pos)?) {
                    (' ', ' ') => Op::OutChar,
                    (' ', '\t') => Op::OutNum,
                    ('\t', ' ') => Op::ReadChar,
                    ('\t', '\t') => Op::ReadNum,
                    _ => return Err(Diagnostic::error("未知のI/O命令です", 1, pos)),
                },
                _ => unreachable!(),
            },
            '\n' => match (take(&tokens, &mut pos)?, take(&tokens, &mut pos)?) {
                (' ', ' ') => Op::Label(parse_label(&tokens, &mut pos)?),
                (' ', '\t') => Op::Call(parse_label(&tokens, &mut pos)?),
                (' ', '\n') => Op::Jump(parse_label(&tokens, &mut pos)?),
                ('\t', ' ') => Op::JumpZero(parse_label(&tokens, &mut pos)?),
                ('\t', '\t') => Op::JumpNeg(parse_label(&tokens, &mut pos)?),
                ('\t', '\n') => Op::Return,
                ('\n', '\n') => Op::End,
                _ => return Err(Diagnostic::error("未知のフロー制御命令です", 1, pos)),
            },
            _ => unreachable!(),
        };
        ops.push(op);
    }
    Ok(ops)
}

fn pop(stack: &mut Vec<i64>, pc: usize) -> Result<i64, Diagnostic> {
    stack
        .pop()
        .ok_or_else(|| Diagnostic::error("スタックが空です", 1, pc + 1))
}

pub fn run(source: &str, stdin: &str) -> ExecuteResult {
    let ops = match parse(source) {
        Ok(ops) => ops,
        Err(e) => return ExecuteResult::failure(e),
    };
    let mut labels = HashMap::new();
    for (i, op) in ops.iter().enumerate() {
        if let Op::Label(name) = op {
            labels.insert(name.clone(), i);
        }
    }
    let mut stack = vec![];
    let mut heap = HashMap::new();
    let mut calls = vec![];
    let mut output = String::new();
    let input: Vec<char> = stdin.chars().collect();
    let mut input_pos = 0;
    let mut pc = 0;
    let mut steps = 0;
    let jump = |name: &String, here: usize| {
        labels
            .get(name)
            .copied()
            .ok_or_else(|| Diagnostic::error(format!("未定義のラベル `{name}` です"), 1, here + 1))
    };
    while pc < ops.len() {
        steps += 1;
        if steps > STEP_LIMIT {
            return ExecuteResult::failure(Diagnostic::error(
                "命令数の上限を超えました",
                1,
                pc + 1,
            ));
        }
        let result: Result<Option<usize>, Diagnostic> = (|| {
            match &ops[pc] {
                Op::Push(v) => stack.push(*v),
                Op::Dup => {
                    let v = *stack
                        .last()
                        .ok_or_else(|| Diagnostic::error("スタックが空です", 1, pc + 1))?;
                    stack.push(v);
                }
                Op::Swap => {
                    if stack.len() < 2 {
                        return Err(Diagnostic::error("swapには2つの値が必要です", 1, pc + 1));
                    }
                    let n = stack.len();
                    stack.swap(n - 1, n - 2);
                }
                Op::Drop => {
                    pop(&mut stack, pc)?;
                }
                Op::Copy(n) => {
                    if *n >= stack.len() {
                        return Err(Diagnostic::error(
                            "copyの位置がスタック範囲外です",
                            1,
                            pc + 1,
                        ));
                    }
                    stack.push(stack[stack.len() - 1 - n]);
                }
                Op::Slide(n) => {
                    let top = pop(&mut stack, pc)?;
                    for _ in 0..*n {
                        pop(&mut stack, pc)?;
                    }
                    stack.push(top);
                }
                Op::Add | Op::Sub | Op::Mul | Op::Div | Op::Mod => {
                    let b = pop(&mut stack, pc)?;
                    let a = pop(&mut stack, pc)?;
                    let v = match ops[pc] {
                        Op::Add => a + b,
                        Op::Sub => a - b,
                        Op::Mul => a * b,
                        Op::Div if b != 0 => a / b,
                        Op::Mod if b != 0 => a % b,
                        _ => return Err(Diagnostic::error("0で除算できません", 1, pc + 1)),
                    };
                    stack.push(v);
                }
                Op::Store => {
                    let v = pop(&mut stack, pc)?;
                    let addr = pop(&mut stack, pc)?;
                    heap.insert(addr, v);
                }
                Op::Retrieve => {
                    let addr = pop(&mut stack, pc)?;
                    stack.push(*heap.get(&addr).unwrap_or(&0));
                }
                Op::Label(_) => {}
                Op::Call(name) => {
                    calls.push(pc + 1);
                    return Ok(Some(jump(name, pc)?));
                }
                Op::Jump(name) => return Ok(Some(jump(name, pc)?)),
                Op::JumpZero(name) => {
                    if pop(&mut stack, pc)? == 0 {
                        return Ok(Some(jump(name, pc)?));
                    }
                }
                Op::JumpNeg(name) => {
                    if pop(&mut stack, pc)? < 0 {
                        return Ok(Some(jump(name, pc)?));
                    }
                }
                Op::Return => {
                    return Ok(Some(calls.pop().ok_or_else(|| {
                        Diagnostic::error("callなしでreturnされました", 1, pc + 1)
                    })?));
                }
                Op::End => return Ok(Some(ops.len())),
                Op::OutChar => {
                    let v = pop(&mut stack, pc)?;
                    output.push(char::from_u32(v as u32).unwrap_or('\u{fffd}'));
                }
                Op::OutNum => output.push_str(&pop(&mut stack, pc)?.to_string()),
                Op::ReadChar => {
                    let addr = pop(&mut stack, pc)?;
                    let ch = input.get(input_pos).copied().unwrap_or('\0');
                    input_pos += usize::from(input_pos < input.len());
                    heap.insert(addr, ch as i64);
                }
                Op::ReadNum => {
                    let addr = pop(&mut stack, pc)?;
                    let rest: String = input[input_pos..].iter().collect();
                    let word = rest.split_whitespace().next().unwrap_or("0");
                    input_pos += rest.find(word).unwrap_or(0) + word.len();
                    heap.insert(addr, word.parse().unwrap_or(0));
                }
            }
            Ok(None)
        })();
        match result {
            Ok(Some(next)) => pc = next,
            Ok(None) => pc += 1,
            Err(e) => return ExecuteResult::failure(e),
        }
        if output.len() > OUTPUT_LIMIT {
            return ExecuteResult::failure(Diagnostic::error(
                "出力サイズの上限を超えました",
                1,
                pc + 1,
            ));
        }
    }
    ExecuteResult::success(output)
}

pub fn lint(source: &str) -> ExecuteResult {
    let ops = match parse(source) {
        Ok(ops) => ops,
        Err(error) => return ExecuteResult::failure(error),
    };
    let mut labels = HashMap::new();
    for (index, op) in ops.iter().enumerate() {
        if let Op::Label(name) = op {
            if labels.insert(name.clone(), index).is_some() {
                return ExecuteResult::failure(Diagnostic::error(
                    format!("ラベル `{name}` が重複しています"),
                    1,
                    index + 1,
                ));
            }
        }
    }
    for (index, op) in ops.iter().enumerate() {
        let target = match op {
            Op::Call(name) | Op::Jump(name) | Op::JumpZero(name) | Op::JumpNeg(name) => Some(name),
            _ => None,
        };
        if let Some(name) = target {
            if !labels.contains_key(name) {
                return ExecuteResult::failure(Diagnostic::error(
                    format!("未定義のラベル `{name}` です"),
                    1,
                    index + 1,
                ));
            }
        }
    }
    ExecuteResult::success(String::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn outputs_a() {
        // push 65, output char, end
        let source = "   \t     \t\n\t\n  \n\n\n";
        assert_eq!(run(source, "").stdout, "A");
    }
    #[test]
    fn ignores_non_whitespace() {
        assert!(parse("hello").is_err());
    }

    #[test]
    fn lint_accepts_a_valid_program_without_running_it() {
        let source = "   \t     \t\n\t\n  \n\n\n";
        assert_eq!(lint(source).exit_code, 0);
    }
}
