// Reads the data modules of the League wiki: a Lua `return { ... }` made of tables, strings, numbers and booleans only.
export function parseLua(source) {
	let i = 0;
	const fail = (what) => {
		throw new Error(`Lua: ${what} at ${i}: ${source.slice(i, i + 40)}`);
	};
	const skip = () => {
		for (;;) {
			while (/\s/.test(source[i] ?? "")) i++;
			if (!source.startsWith("--", i)) return;
			const long = /^--\[(=*)\[/.exec(source.slice(i, i + 20));
			if (long) {
				const end = source.indexOf(`]${long[1]}]`, i);
				i = end < 0 ? source.length : end + long[1].length + 2;
			} else {
				while (i < source.length && source[i] !== "\n") i++;
			}
		}
	};
	const string = () => {
		const long = /^\[(=*)\[/.exec(source.slice(i, i + 20));
		if (long) {
			const end = source.indexOf(`]${long[1]}]`, i);
			const text = source.slice(i + long[0].length, end);
			i = end + long[1].length + 2;
			return text;
		}
		const quote = source[i++];
		let text = "";
		while (source[i] !== quote) {
			if (i >= source.length) fail("unterminated string");
			text += source[i] === "\\" ? ({ n: "\n", t: "\t" }[source[++i]] ?? source[i]) : source[i];
			i++;
		}
		i++;
		return text;
	};
	const value = () => {
		skip();
		const c = source[i];
		if (c === "{") return table();
		if (c === '"' || c === "'" || source.startsWith("[[", i) || source.startsWith("[=", i)) return string();
		const word = /^(true|false|nil)\b/.exec(source.slice(i, i + 6));
		if (word) {
			i += word[0].length;
			return { true: true, false: false, nil: null }[word[0]];
		}
		return sum();
	};
	// The wiki writes a few numbers as a sum or a ratio (`84+1000/17`): + - * / between numbers, nothing else.
	const number = () => {
		skip();
		const found = /^-?(0x[0-9a-fA-F]+|\d+\.?\d*(e[+-]?\d+)?|\.\d+)/.exec(source.slice(i, i + 40));
		if (!found) fail("unexpected value");
		i += found[0].length;
		return Number(found[0]);
	};
	const product = () => {
		let total = number();
		for (skip(); source[i] === "*" || source[i] === "/"; skip()) total = source[i++] === "*" ? total * number() : total / number();
		return total;
	};
	const sum = () => {
		let total = product();
		for (skip(); source[i] === "+" || source[i] === "-"; skip()) total = source[i++] === "+" ? total + product() : total - product();
		return total;
	};
	const table = () => {
		i++;
		const object = {};
		let index = 1;
		for (;;) {
			skip();
			if (source[i] === "}") {
				i++;
				return object;
			}
			let key;
			const named = /^([A-Za-z_]\w*)\s*=(?!=)/.exec(source.slice(i, i + 80));
			if (named) {
				key = named[1];
				i += named[0].length;
			} else if (source[i] === "[" && !source.startsWith("[[", i) && !source.startsWith("[=", i)) {
				i++;
				skip();
				key = value();
				skip();
				if (source[i++] !== "]") fail("expected ]");
				skip();
				if (source[i++] !== "=") fail("expected =");
			}
			const item = value();
			if (key === undefined) object[index++] = item;
			else object[key] = item;
			skip();
			if (source[i] === "," || source[i] === ";") i++;
		}
	};
	skip();
	if (!source.startsWith("return", i)) fail("expected return");
	i += 6;
	return value();
}
