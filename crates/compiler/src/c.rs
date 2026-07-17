use crate::{Diagnostic, ExecuteResult, OUTPUT_LIMIT, STEP_LIMIT};
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq)]
enum Kind {
    Number(i64),
    Text(String),
    Char(i64),
    Ident(String),
    Symbol(String),
    Keyword(String),
    Eof,
}

#[derive(Clone, Debug)]
struct Token {
    kind: Kind,
    line: usize,
    column: usize,
}

fn lex(source: &str) -> Result<Vec<Token>, Diagnostic> {
    let chars: Vec<char> = source.chars().collect();
    let mut out = vec![];
    let mut i = 0;
    let mut line = 1;
    let mut column = 1;
    while i < chars.len() {
        let ch = chars[i];
        if ch == '\n' {
            i += 1;
            line += 1;
            column = 1;
            continue;
        }
        if ch.is_whitespace() {
            i += 1;
            column += 1;
            continue;
        }
        if ch == '#' {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
                column += 1;
            }
            continue;
        }
        if ch == '/' && chars.get(i + 1) == Some(&'/') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
                column += 1;
            }
            continue;
        }
        if ch == '/' && chars.get(i + 1) == Some(&'*') {
            let (start_line, start_col) = (line, column);
            i += 2;
            column += 2;
            let mut closed = false;
            while i < chars.len() {
                if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    i += 2;
                    column += 2;
                    closed = true;
                    break;
                }
                if chars[i] == '\n' {
                    line += 1;
                    column = 1;
                } else {
                    column += 1;
                }
                i += 1;
            }
            if !closed {
                return Err(Diagnostic::error(
                    "ブロックコメントが閉じられていません",
                    start_line,
                    start_col,
                ));
            }
            continue;
        }
        let start = column;
        if ch.is_ascii_digit() {
            let begin = i;
            while i < chars.len() && chars[i].is_ascii_digit() {
                i += 1;
                column += 1;
            }
            let text: String = chars[begin..i].iter().collect();
            out.push(Token {
                kind: Kind::Number(
                    text.parse()
                        .map_err(|_| Diagnostic::error("整数が大きすぎます", line, start))?,
                ),
                line,
                column: start,
            });
            continue;
        }
        if ch.is_ascii_alphabetic() || ch == '_' {
            let begin = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                i += 1;
                column += 1;
            }
            let text: String = chars[begin..i].iter().collect();
            let kind = if matches!(
                text.as_str(),
                "int"
                    | "char"
                    | "void"
                    | "return"
                    | "if"
                    | "else"
                    | "while"
                    | "for"
                    | "break"
                    | "continue"
            ) {
                Kind::Keyword(text)
            } else {
                Kind::Ident(text)
            };
            out.push(Token {
                kind,
                line,
                column: start,
            });
            continue;
        }
        if ch == '"' || ch == '\'' {
            let quote = ch;
            i += 1;
            column += 1;
            let mut value = String::new();
            let mut closed = false;
            while i < chars.len() {
                let current = chars[i];
                if current == quote {
                    i += 1;
                    column += 1;
                    closed = true;
                    break;
                }
                if current == '\n' {
                    return Err(Diagnostic::error(
                        "文字列または文字リテラルが閉じられていません",
                        line,
                        start,
                    ));
                }
                if current == '\\' {
                    i += 1;
                    column += 1;
                    let escaped = *chars
                        .get(i)
                        .ok_or_else(|| Diagnostic::error("不完全なエスケープです", line, column))?;
                    value.push(match escaped {
                        'n' => '\n',
                        't' => '\t',
                        'r' => '\r',
                        '0' => '\0',
                        '\\' => '\\',
                        '\'' => '\'',
                        '"' => '"',
                        other => other,
                    });
                } else {
                    value.push(current);
                }
                i += 1;
                column += 1;
            }
            if !closed {
                return Err(Diagnostic::error(
                    "文字列または文字リテラルが閉じられていません",
                    line,
                    start,
                ));
            }
            let kind = if quote == '\'' {
                let mut values = value.chars();
                let first = values
                    .next()
                    .ok_or_else(|| Diagnostic::error("空の文字リテラルです", line, start))?;
                if values.next().is_some() {
                    return Err(Diagnostic::error(
                        "文字リテラルには1文字だけ指定できます",
                        line,
                        start,
                    ));
                }
                Kind::Char(first as i64)
            } else {
                Kind::Text(value)
            };
            out.push(Token {
                kind,
                line,
                column: start,
            });
            continue;
        }
        let pair = chars.get(i + 1).map(|next| format!("{ch}{next}"));
        let symbol = if matches!(
            pair.as_deref(),
            Some("==" | "!=" | "<=" | ">=" | "&&" | "||" | "++" | "--" | "+=" | "-=" | "*=" | "/=")
        ) {
            i += 2;
            column += 2;
            pair.unwrap()
        } else if "(){};,+-*/%<>=!".contains(ch) {
            i += 1;
            column += 1;
            ch.to_string()
        } else {
            return Err(Diagnostic::error(
                format!("未対応の文字 `{ch}` です"),
                line,
                start,
            ));
        };
        out.push(Token {
            kind: Kind::Symbol(symbol),
            line,
            column: start,
        });
    }
    out.push(Token {
        kind: Kind::Eof,
        line,
        column,
    });
    Ok(out)
}

#[derive(Clone, Debug, PartialEq)]
enum Value {
    Int(i64),
    Str(String),
}
impl Value {
    fn int(&self) -> i64 {
        match self {
            Self::Int(v) => *v,
            Self::Str(s) => !s.is_empty() as i64,
        }
    }
    fn text(&self) -> String {
        match self {
            Self::Int(v) => v.to_string(),
            Self::Str(s) => s.clone(),
        }
    }
}

#[derive(Clone, Debug)]
enum Expr {
    Value(Value),
    Var(String, usize, usize),
    Unary(String, Box<Expr>, usize, usize),
    Binary(String, Box<Expr>, Box<Expr>, usize, usize),
    Assign(String, String, Box<Expr>, usize, usize),
    Call(String, Vec<Expr>, usize, usize),
    Postfix(String, String, usize, usize),
}

#[derive(Clone, Debug)]
enum Stmt {
    Block(Vec<Stmt>),
    Decl(String, Option<Expr>, usize, usize),
    Expr(Expr),
    Return(Option<Expr>),
    If(Expr, Box<Stmt>, Option<Box<Stmt>>),
    While(Expr, Box<Stmt>),
    For(Option<Box<Stmt>>, Option<Expr>, Option<Expr>, Box<Stmt>),
    Break,
    Continue,
    Empty,
}

#[derive(Clone, Debug)]
struct Function {
    params: Vec<String>,
    body: Stmt,
    line: usize,
    column: usize,
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}
impl Parser {
    fn token(&self) -> &Token {
        &self.tokens[self.pos]
    }
    fn advance(&mut self) -> Token {
        let t = self.tokens[self.pos].clone();
        self.pos += 1;
        t
    }
    fn symbol(&mut self, s: &str) -> bool {
        if self.token().kind == Kind::Symbol(s.into()) {
            self.pos += 1;
            true
        } else {
            false
        }
    }
    fn keyword(&mut self, s: &str) -> bool {
        if self.token().kind == Kind::Keyword(s.into()) {
            self.pos += 1;
            true
        } else {
            false
        }
    }
    fn expect_symbol(&mut self, s: &str) -> Result<(), Diagnostic> {
        if self.symbol(s) {
            Ok(())
        } else {
            Err(self.error(format!("`{s}` が必要です")))
        }
    }
    fn error(&self, msg: impl Into<String>) -> Diagnostic {
        Diagnostic::error(msg, self.token().line, self.token().column)
    }
    fn ident(&mut self) -> Result<(String, usize, usize), Diagnostic> {
        let t = self.advance();
        if let Kind::Ident(s) = t.kind {
            Ok((s, t.line, t.column))
        } else {
            Err(Diagnostic::error("識別子が必要です", t.line, t.column))
        }
    }
    fn data_type(&mut self) -> bool {
        self.keyword("int") || self.keyword("char") || self.keyword("void")
    }
    fn program(&mut self) -> Result<HashMap<String, Function>, Diagnostic> {
        let mut functions = HashMap::new();
        while self.token().kind != Kind::Eof {
            if !self.data_type() {
                return Err(self.error("関数の戻り値型（int / char / void）が必要です"));
            }
            let (name, line, column) = self.ident()?;
            self.expect_symbol("(")?;
            let mut params = vec![];
            if !self.symbol(")") {
                loop {
                    if !self.data_type() {
                        return Err(self.error("引数の型が必要です"));
                    }
                    if self.symbol(")") {
                        break;
                    }
                    let (p, _, _) = self.ident()?;
                    params.push(p);
                    if self.symbol(")") {
                        break;
                    }
                    self.expect_symbol(",")?;
                }
            }
            let body = self.statement()?;
            if !matches!(body, Stmt::Block(_)) {
                return Err(Diagnostic::error(
                    "関数本体にはブロックが必要です",
                    line,
                    column,
                ));
            }
            if functions
                .insert(
                    name.clone(),
                    Function {
                        params,
                        body,
                        line,
                        column,
                    },
                )
                .is_some()
            {
                return Err(Diagnostic::error(
                    format!("関数 `{name}` が重複しています"),
                    line,
                    column,
                ));
            }
        }
        Ok(functions)
    }
    fn statement(&mut self) -> Result<Stmt, Diagnostic> {
        if self.symbol("{") {
            let mut body = vec![];
            while !self.symbol("}") {
                if self.token().kind == Kind::Eof {
                    return Err(self.error("ブロックが閉じられていません"));
                }
                body.push(self.statement()?);
            }
            return Ok(Stmt::Block(body));
        }
        if self.data_type() {
            let (name, l, c) = self.ident()?;
            let value = if self.symbol("=") {
                Some(self.expression()?)
            } else {
                None
            };
            self.expect_symbol(";")?;
            return Ok(Stmt::Decl(name, value, l, c));
        }
        if self.keyword("return") {
            let v = if self.symbol(";") {
                None
            } else {
                let e = self.expression()?;
                self.expect_symbol(";")?;
                Some(e)
            };
            return Ok(Stmt::Return(v));
        }
        if self.keyword("if") {
            self.expect_symbol("(")?;
            let cond = self.expression()?;
            self.expect_symbol(")")?;
            let yes = Box::new(self.statement()?);
            let no = if self.keyword("else") {
                Some(Box::new(self.statement()?))
            } else {
                None
            };
            return Ok(Stmt::If(cond, yes, no));
        }
        if self.keyword("while") {
            self.expect_symbol("(")?;
            let cond = self.expression()?;
            self.expect_symbol(")")?;
            return Ok(Stmt::While(cond, Box::new(self.statement()?)));
        }
        if self.keyword("for") {
            self.expect_symbol("(")?;
            let init = if self.symbol(";") {
                None
            } else if self.data_type() {
                let (n, l, c) = self.ident()?;
                let v = if self.symbol("=") {
                    Some(self.expression()?)
                } else {
                    None
                };
                self.expect_symbol(";")?;
                Some(Box::new(Stmt::Decl(n, v, l, c)))
            } else {
                let e = self.expression()?;
                self.expect_symbol(";")?;
                Some(Box::new(Stmt::Expr(e)))
            };
            let cond = if self.symbol(";") {
                None
            } else {
                let e = self.expression()?;
                self.expect_symbol(";")?;
                Some(e)
            };
            let step = if self.symbol(")") {
                None
            } else {
                let e = self.expression()?;
                self.expect_symbol(")")?;
                Some(e)
            };
            return Ok(Stmt::For(init, cond, step, Box::new(self.statement()?)));
        }
        if self.keyword("break") {
            self.expect_symbol(";")?;
            return Ok(Stmt::Break);
        }
        if self.keyword("continue") {
            self.expect_symbol(";")?;
            return Ok(Stmt::Continue);
        }
        if self.symbol(";") {
            return Ok(Stmt::Empty);
        }
        let e = self.expression()?;
        self.expect_symbol(";")?;
        Ok(Stmt::Expr(e))
    }
    fn expression(&mut self) -> Result<Expr, Diagnostic> {
        self.assignment()
    }
    fn assignment(&mut self) -> Result<Expr, Diagnostic> {
        let left = self.logical_or()?;
        if let Kind::Symbol(op) = self.token().kind.clone() {
            if matches!(op.as_str(), "=" | "+=" | "-=" | "*=" | "/=") {
                let t = self.advance();
                if let Expr::Var(name, _, _) = left {
                    return Ok(Expr::Assign(
                        name,
                        op,
                        Box::new(self.assignment()?),
                        t.line,
                        t.column,
                    ));
                }
                return Err(Diagnostic::error(
                    "代入先は変数である必要があります",
                    t.line,
                    t.column,
                ));
            }
        }
        Ok(left)
    }
    fn binary(
        &mut self,
        next: fn(&mut Self) -> Result<Expr, Diagnostic>,
        ops: &[&str],
    ) -> Result<Expr, Diagnostic> {
        let mut e = next(self)?;
        loop {
            let op = match &self.token().kind {
                Kind::Symbol(s) if ops.contains(&s.as_str()) => s.clone(),
                _ => break,
            };
            let t = self.advance();
            let r = next(self)?;
            e = Expr::Binary(op, Box::new(e), Box::new(r), t.line, t.column);
        }
        Ok(e)
    }
    fn logical_or(&mut self) -> Result<Expr, Diagnostic> {
        self.binary(Self::logical_and, &["||"])
    }
    fn logical_and(&mut self) -> Result<Expr, Diagnostic> {
        self.binary(Self::equality, &["&&"])
    }
    fn equality(&mut self) -> Result<Expr, Diagnostic> {
        self.binary(Self::comparison, &["==", "!="])
    }
    fn comparison(&mut self) -> Result<Expr, Diagnostic> {
        self.binary(Self::term, &["<", "<=", ">", ">="])
    }
    fn term(&mut self) -> Result<Expr, Diagnostic> {
        self.binary(Self::factor, &["+", "-"])
    }
    fn factor(&mut self) -> Result<Expr, Diagnostic> {
        self.binary(Self::unary, &["*", "/", "%"])
    }
    fn unary(&mut self) -> Result<Expr, Diagnostic> {
        if let Kind::Symbol(op) = self.token().kind.clone() {
            if matches!(op.as_str(), "!" | "-" | "+") {
                let t = self.advance();
                return Ok(Expr::Unary(op, Box::new(self.unary()?), t.line, t.column));
            }
        }
        self.postfix()
    }
    fn postfix(&mut self) -> Result<Expr, Diagnostic> {
        let e = self.primary()?;
        if let Kind::Symbol(op) = self.token().kind.clone() {
            if matches!(op.as_str(), "++" | "--") {
                let t = self.advance();
                if let Expr::Var(name, _, _) = e {
                    return Ok(Expr::Postfix(name, op, t.line, t.column));
                }
                return Err(Diagnostic::error(
                    "++/-- は変数にだけ使用できます",
                    t.line,
                    t.column,
                ));
            }
        }
        Ok(e)
    }
    fn primary(&mut self) -> Result<Expr, Diagnostic> {
        let t = self.advance();
        match t.kind {
            Kind::Number(v) | Kind::Char(v) => Ok(Expr::Value(Value::Int(v))),
            Kind::Text(v) => Ok(Expr::Value(Value::Str(v))),
            Kind::Ident(name) => {
                if self.symbol("(") {
                    let mut args = vec![];
                    if !self.symbol(")") {
                        loop {
                            args.push(self.expression()?);
                            if self.symbol(")") {
                                break;
                            }
                            self.expect_symbol(",")?;
                        }
                    }
                    Ok(Expr::Call(name, args, t.line, t.column))
                } else {
                    Ok(Expr::Var(name, t.line, t.column))
                }
            }
            Kind::Symbol(s) if s == "(" => {
                let e = self.expression()?;
                self.expect_symbol(")")?;
                Ok(e)
            }
            _ => Err(Diagnostic::error("式が必要です", t.line, t.column)),
        }
    }
}

#[derive(PartialEq)]
enum Flow {
    Normal,
    Return(Value),
    Break,
    Continue,
}
struct Runtime<'a> {
    functions: &'a HashMap<String, Function>,
    scopes: Vec<HashMap<String, Value>>,
    stdin: Vec<char>,
    input_pos: usize,
    output: String,
    steps: usize,
    call_depth: usize,
}
impl Runtime<'_> {
    fn error(&self, msg: impl Into<String>, l: usize, c: usize) -> Diagnostic {
        Diagnostic::error(msg, l, c)
    }
    fn tick(&mut self, l: usize, c: usize) -> Result<(), Diagnostic> {
        self.steps += 1;
        if self.steps > STEP_LIMIT {
            Err(self.error("命令数の上限を超えました", l, c))
        } else {
            Ok(())
        }
    }
    fn get(&self, n: &str, l: usize, c: usize) -> Result<Value, Diagnostic> {
        for s in self.scopes.iter().rev() {
            if let Some(v) = s.get(n) {
                return Ok(v.clone());
            }
        }
        Err(self.error(format!("未定義の変数 `{n}` です"), l, c))
    }
    fn set(&mut self, n: &str, v: Value, l: usize, c: usize) -> Result<(), Diagnostic> {
        for s in self.scopes.iter_mut().rev() {
            if s.contains_key(n) {
                s.insert(n.into(), v);
                return Ok(());
            }
        }
        Err(Diagnostic::error(format!("未定義の変数 `{n}` です"), l, c))
    }
    fn expr(&mut self, e: &Expr) -> Result<Value, Diagnostic> {
        match e {
            Expr::Value(v) => Ok(v.clone()),
            Expr::Var(n, l, c) => self.get(n, *l, *c),
            Expr::Unary(op, e, l, c) => {
                self.tick(*l, *c)?;
                let v = self.expr(e)?.int();
                Ok(Value::Int(match op.as_str() {
                    "-" => -v,
                    "!" => (v == 0) as i64,
                    _ => v,
                }))
            }
            Expr::Binary(op, a, b, l, c) => {
                self.tick(*l, *c)?;
                let av = self.expr(a)?;
                if op == "&&" && av.int() == 0 {
                    return Ok(Value::Int(0));
                }
                if op == "||" && av.int() != 0 {
                    return Ok(Value::Int(1));
                }
                let bv = self.expr(b)?;
                let (x, y) = (av.int(), bv.int());
                let v = match op.as_str() {
                    "+" => x.checked_add(y),
                    "-" => x.checked_sub(y),
                    "*" => x.checked_mul(y),
                    "/" if y != 0 => x.checked_div(y),
                    "%" if y != 0 => x.checked_rem(y),
                    "==" => Some((x == y) as i64),
                    "!=" => Some((x != y) as i64),
                    "<" => Some((x < y) as i64),
                    "<=" => Some((x <= y) as i64),
                    ">" => Some((x > y) as i64),
                    ">=" => Some((x >= y) as i64),
                    "&&" => Some((x != 0 && y != 0) as i64),
                    "||" => Some((x != 0 || y != 0) as i64),
                    _ => None,
                }
                .ok_or_else(|| {
                    self.error(
                        if y == 0 {
                            "0で除算できません"
                        } else {
                            "整数演算でオーバーフローしました"
                        },
                        *l,
                        *c,
                    )
                })?;
                Ok(Value::Int(v))
            }
            Expr::Assign(n, op, e, l, c) => {
                let rhs = self.expr(e)?.int();
                let old = if op == "=" {
                    0
                } else {
                    self.get(n, *l, *c)?.int()
                };
                let v = match op.as_str() {
                    "=" => rhs,
                    "+=" => old + rhs,
                    "-=" => old - rhs,
                    "*=" => old * rhs,
                    "/=" if rhs != 0 => old / rhs,
                    _ => return Err(self.error("0で除算できません", *l, *c)),
                };
                self.set(n, Value::Int(v), *l, *c)?;
                Ok(Value::Int(v))
            }
            Expr::Postfix(n, op, l, c) => {
                let old = self.get(n, *l, *c)?.int();
                self.set(
                    n,
                    Value::Int(if op == "++" { old + 1 } else { old - 1 }),
                    *l,
                    *c,
                )?;
                Ok(Value::Int(old))
            }
            Expr::Call(n, args, l, c) => {
                let values = args
                    .iter()
                    .map(|a| self.expr(a))
                    .collect::<Result<Vec<_>, _>>()?;
                self.call(n, values, *l, *c)
            }
        }
    }
    fn call(
        &mut self,
        name: &str,
        args: Vec<Value>,
        l: usize,
        c: usize,
    ) -> Result<Value, Diagnostic> {
        self.tick(l, c)?;
        match name {
            "printf" => {
                if args.is_empty() {
                    return Err(self.error("printfには書式文字列が必要です", l, c));
                }
                let fmt = match &args[0] {
                    Value::Str(s) => s.clone(),
                    _ => {
                        return Err(self.error(
                            "printfの第1引数は文字列である必要があります",
                            l,
                            c,
                        ));
                    }
                };
                let mut out = String::new();
                let mut values = args[1..].iter();
                let mut ch = fmt.chars();
                while let Some(x) = ch.next() {
                    if x == '%' {
                        match ch.next() {
                            Some('%') => out.push('%'),
                            Some('d') => out.push_str(
                                &values.next().unwrap_or(&Value::Int(0)).int().to_string(),
                            ),
                            Some('c') => {
                                out.push(
                                    char::from_u32(
                                        values.next().unwrap_or(&Value::Int(0)).int() as u32
                                    )
                                    .unwrap_or('\u{fffd}'),
                                )
                            }
                            Some('s') => out.push_str(
                                &values.next().unwrap_or(&Value::Str(String::new())).text(),
                            ),
                            Some(other) => {
                                out.push('%');
                                out.push(other)
                            }
                            None => out.push('%'),
                        }
                    } else {
                        out.push(x)
                    }
                }
                let count = out.len() as i64;
                self.output.push_str(&out);
                Ok(Value::Int(count))
            }
            "puts" => {
                let text = args.first().map(Value::text).unwrap_or_default();
                self.output.push_str(&text);
                self.output.push('\n');
                Ok(Value::Int(0))
            }
            "putchar" => {
                let v = args.first().map(Value::int).unwrap_or(0);
                self.output
                    .push(char::from_u32(v as u32).unwrap_or('\u{fffd}'));
                Ok(Value::Int(v))
            }
            "getchar" => {
                let v = self
                    .stdin
                    .get(self.input_pos)
                    .map(|v| *v as i64)
                    .unwrap_or(-1);
                if self.input_pos < self.stdin.len() {
                    self.input_pos += 1;
                }
                Ok(Value::Int(v))
            }
            _ => {
                let f = self
                    .functions
                    .get(name)
                    .cloned()
                    .ok_or_else(|| self.error(format!("未定義の関数 `{name}` です"), l, c))?;
                if args.len() != f.params.len() {
                    return Err(self.error(
                        format!("関数 `{name}` の引数は{}個必要です", f.params.len()),
                        l,
                        c,
                    ));
                }
                if self.call_depth >= 128 {
                    return Err(self.error("関数呼び出しが深すぎます", l, c));
                }
                self.call_depth += 1;
                self.scopes.push(f.params.into_iter().zip(args).collect());
                let flow = self.stmt(&f.body)?;
                self.scopes.pop();
                self.call_depth -= 1;
                match flow {
                    Flow::Return(v) => Ok(v),
                    Flow::Normal => Ok(Value::Int(0)),
                    _ => Err(self.error(
                        "break/continueはループ内で使用してください",
                        f.line,
                        f.column,
                    )),
                }
            }
        }
    }
    fn stmt(&mut self, s: &Stmt) -> Result<Flow, Diagnostic> {
        if self.output.len() > OUTPUT_LIMIT {
            return Err(self.error("出力サイズの上限を超えました", 1, 1));
        }
        match s {
            Stmt::Block(body) => {
                self.scopes.push(HashMap::new());
                for s in body {
                    let f = self.stmt(s)?;
                    if f != Flow::Normal {
                        self.scopes.pop();
                        return Ok(f);
                    }
                }
                self.scopes.pop();
                Ok(Flow::Normal)
            }
            Stmt::Decl(n, e, l, c) => {
                if self.scopes.last().unwrap().contains_key(n) {
                    return Err(self.error(format!("変数 `{n}` が重複しています"), *l, *c));
                }
                let v = if let Some(e) = e {
                    self.expr(e)?
                } else {
                    Value::Int(0)
                };
                self.scopes.last_mut().unwrap().insert(n.clone(), v);
                Ok(Flow::Normal)
            }
            Stmt::Expr(e) => {
                self.expr(e)?;
                Ok(Flow::Normal)
            }
            Stmt::Return(e) => Ok(Flow::Return(if let Some(e) = e {
                self.expr(e)?
            } else {
                Value::Int(0)
            })),
            Stmt::If(c, y, n) => {
                if self.expr(c)?.int() != 0 {
                    self.stmt(y)
                } else if let Some(n) = n {
                    self.stmt(n)
                } else {
                    Ok(Flow::Normal)
                }
            }
            Stmt::While(c, b) => {
                loop {
                    if self.expr(c)?.int() == 0 {
                        break;
                    }
                    match self.stmt(b)? {
                        Flow::Return(v) => return Ok(Flow::Return(v)),
                        Flow::Break => break,
                        _ => {}
                    }
                }
                Ok(Flow::Normal)
            }
            Stmt::For(i, c, step, b) => {
                self.scopes.push(HashMap::new());
                if let Some(i) = i {
                    self.stmt(i)?;
                }
                loop {
                    if let Some(c) = c {
                        if self.expr(c)?.int() == 0 {
                            break;
                        }
                    }
                    match self.stmt(b)? {
                        Flow::Return(v) => {
                            self.scopes.pop();
                            return Ok(Flow::Return(v));
                        }
                        Flow::Break => break,
                        _ => {}
                    }
                    if let Some(s) = step {
                        self.expr(s)?;
                    }
                }
                self.scopes.pop();
                Ok(Flow::Normal)
            }
            Stmt::Break => Ok(Flow::Break),
            Stmt::Continue => Ok(Flow::Continue),
            Stmt::Empty => Ok(Flow::Normal),
        }
    }
}

pub fn run(source: &str, stdin: &str) -> ExecuteResult {
    let tokens = match lex(source) {
        Ok(v) => v,
        Err(e) => return ExecuteResult::failure(e),
    };
    let functions = match (Parser { tokens, pos: 0 }).program() {
        Ok(v) => v,
        Err(e) => return ExecuteResult::failure(e),
    };
    if !functions.contains_key("main") {
        return ExecuteResult::failure(Diagnostic::error("main関数が見つかりません", 1, 1));
    }
    let mut runtime = Runtime {
        functions: &functions,
        scopes: vec![HashMap::new()],
        stdin: stdin.chars().collect(),
        input_pos: 0,
        output: String::new(),
        steps: 0,
        call_depth: 0,
    };
    match runtime.call("main", vec![], 1, 1) {
        Ok(_) => ExecuteResult::success(runtime.output),
        Err(e) => {
            let mut result = ExecuteResult::failure(e);
            result.stdout = runtime.output;
            result
        }
    }
}

pub fn lint(source: &str) -> ExecuteResult {
    let tokens = match lex(source) {
        Ok(tokens) => tokens,
        Err(error) => return ExecuteResult::failure(error),
    };
    let functions = match (Parser { tokens, pos: 0 }).program() {
        Ok(functions) => functions,
        Err(error) => return ExecuteResult::failure(error),
    };
    if !functions.contains_key("main") {
        return ExecuteResult::failure(Diagnostic::error("main関数が見つかりません", 1, 1));
    }
    ExecuteResult::success(String::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hello() {
        let r = run("int main(){ printf(\"Hello %d!\\n\", 42); return 0; }", "");
        assert_eq!(r.stdout, "Hello 42!\n");
        assert_eq!(r.exit_code, 0);
    }
    #[test]
    fn loop_and_function() {
        let code = "int twice(int n){return n*2;} int main(){for(int i=0;i<3;i++){printf(\"%d \",twice(i));}return 0;}";
        assert_eq!(run(code, "").stdout, "0 2 4 ");
    }
    #[test]
    fn reports_position() {
        let r = run("int main(){ return missing; }", "");
        assert_eq!(r.exit_code, 1);
        assert!(r.stderr.contains("未定義"));
    }

    #[test]
    fn lint_does_not_execute() {
        let result = lint("int main(){ while(1){} return 0; }");
        assert_eq!(result.exit_code, 0);
        assert!(result.stdout.is_empty());
    }
}
