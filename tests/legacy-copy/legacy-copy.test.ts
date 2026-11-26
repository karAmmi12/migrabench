// Copie expurgée du legacy (ADR 0010, #125) : fonctions pures, sans Docker.
import { describe, expect, it } from "vitest";
import {
  BENCH_MARKER,
  commentsOf,
  expurgate,
  filterDataset,
  type Rewrite,
  stripBenchComments,
  type SourceFile,
  unmarkedBenchComments,
  workDirRefusal,
  copyDigest,
} from "../../scripts/legacy-copy.ts";

describe("commentsOf", () => {
  it("finds Java block, Javadoc and line comments, and ignores comment syntax inside string and char literals", () => {
    const java = [
      "/** Doc. */",
      "class A {",
      '  String url = "http://x/* not a comment */";',
      "  char c = '/'; // line",
      "  /* block */",
      "}",
    ].join("\n");

    expect(commentsOf("A.java", java).map((comment) => comment.text)).toEqual(["/** Doc. */", "// line", "/* block */"]);
  });

  it("finds JSP and HTML comments in a JSP, but not a // inside an attribute", () => {
    const jsp = '<%-- jsp --%>\n<a href="http://localhost:8090/x">x</a>\n<!-- html -->';

    expect(commentsOf("a.jsp", jsp).map((comment) => comment.text)).toEqual(["<%-- jsp --%>", "<!-- html -->"]);
  });

  it("finds XML comments", () => {
    expect(commentsOf("web.xml", "<a>\n  <!-- one\n  two -->\n</a>").map((comment) => comment.text)).toEqual([
      "<!-- one\n  two -->",
    ]);
  });

  it("finds properties comments starting with # or !", () => {
    const properties = "# one\nkey=value # not a comment\n  ! two\n";

    expect(commentsOf("a.properties", properties).map((comment) => comment.text)).toEqual(["# one", "! two"]);
  });

  it("finds no comment in a JSON file", () => {
    expect(commentsOf("dossiers.json", '{ "a": "/* x */" }')).toEqual([]);
  });

  it("refuses a file type it cannot read comments from", () => {
    expect(() => commentsOf("app.js", "// x")).toThrow("No comment syntax known for app.js");
  });
});

describe("stripBenchComments", () => {
  it("removes a marked comment and the lines it leaves blank, and keeps unmarked comments", () => {
    const java = [
      "/** Doc kept. */",
      `// ${BENCH_MARKER} bench note`,
      `/* ${BENCH_MARKER} bench`,
      "   block */",
      "class A {}",
    ].join("\n");

    expect(stripBenchComments("A.java", java)).toBe("/** Doc kept. */\nclass A {}");
  });

  it("keeps the code on a line whose trailing comment is marked", () => {
    expect(stripBenchComments("A.java", `int a = 1; // ${BENCH_MARKER} note\nint b;`)).toBe("int a = 1;\nint b;");
  });

  it("removes a marked JSP comment between two tags", () => {
    const jsp = `<body>\n<%-- ${BENCH_MARKER} note\n     more --%>\n<table>`;

    expect(stripBenchComments("a.jsp", jsp)).toBe("<body>\n<table>");
  });

  it("removes a marked properties comment line", () => {
    expect(stripBenchComments("a.properties", `# ${BENCH_MARKER} note\n# kept\nkey=value\n`)).toBe("# kept\nkey=value\n");
  });
});

describe("filterDataset", () => {
  it("keeps only the dossiers absent from every reservation and drops the reservations key", () => {
    const json = JSON.stringify({
      dossiers: [
        { number: "D-0001", applicant: "A", subject: "S", status: "BROUILLON", filedOn: "2024-01-01" },
        { number: "D-0101", applicant: "B", subject: "T", status: "REMIS", filedOn: "2024-01-02", submittedOn: "2024-02-01" },
      ],
      reservations: { "gate:xss": ["D-0101"] },
    });

    expect(JSON.parse(filterDataset(json))).toEqual({
      dossiers: [{ number: "D-0001", applicant: "A", subject: "S", status: "BROUILLON", filedOn: "2024-01-01" }],
    });
  });

  it("writes one dossier per line, like the legacy file", () => {
    const json = JSON.stringify({
      dossiers: [{ number: "D-0001", applicant: "A", subject: "S", status: "BROUILLON", filedOn: "2024-01-01" }],
      reservations: {},
    });

    expect(filterDataset(json)).toBe(
      '{\n  "dossiers": [\n    { "number": "D-0001", "applicant": "A", "subject": "S", "status": "BROUILLON", "filedOn": "2024-01-01" }\n  ]\n}\n',
    );
  });
});

describe("expurgate", () => {
  const file = (path: string, content: string): SourceFile => ({ path, content });

  it("leaves out TRAPS.md, the Dockerfile and access-log/", () => {
    const copy = expurgate([
      file("TRAPS.md", "x"),
      file("Dockerfile", "x"),
      file("access-log/rewrite.config", "x"),
      file("pom.xml", "<project/>"),
    ]);

    expect(copy.map((entry) => entry.path)).toEqual(["pom.xml"]);
  });

  it("renames the Java package in paths and contents, and every other mention of the bench name", () => {
    const copy = expurgate([
      file("src/main/java/fr/migrabench/legacy/web/A.java", "package fr.migrabench.legacy.web;"),
      file("src/main/resources/fr/migrabench/legacy/Messages.properties", "a=b"),
      file("pom.xml", "<groupId>fr.migrabench</groupId>"),
      file("src/main/webapp/WEB-INF/web.xml", "<realm-name>migrabench</realm-name>"),
    ]);

    expect(copy).toEqual([
      file("src/main/java/fr/mairie/dossiers/web/A.java", "package fr.mairie.dossiers.web;"),
      file("src/main/resources/fr/mairie/dossiers/Messages.properties", "a=b"),
      file("pom.xml", "<groupId>fr.mairie</groupId>"),
      file("src/main/webapp/WEB-INF/web.xml", "<realm-name>dossiers</realm-name>"),
    ]);
  });

  it("strips the marked comments and filters the dataset", () => {
    const copy = expurgate([
      file("A.java", `// ${BENCH_MARKER} note\nclass A {}`),
      file("src/main/resources/dossiers.json", JSON.stringify({ dossiers: [], reservations: {} })),
    ]);

    expect(copy).toEqual([file("A.java", "class A {}"), file("src/main/resources/dossiers.json", '{\n  "dossiers": [\n  ]\n}\n')]);
  });

  it("rewrites the given text in its file, before the renames", () => {
    const rewrites: Rewrite[] = [{ path: "src/main/java/fr/migrabench/legacy/A.java", from: '"the bench"', to: '"x"' }];
    const copy = expurgate([file("src/main/java/fr/migrabench/legacy/A.java", 'String s = "the bench";'), file("B.java", '"the bench"')], rewrites);

    expect(copy).toEqual([file("src/main/java/fr/mairie/dossiers/A.java", 'String s = "x";'), file("B.java", '"the bench"')]);
  });

  it.each([
    ["absent", "class A {}"],
    ["present twice", '"the bench" "the bench"'],
  ])("refuses a rewrite whose text is %s in its file", (_case, content) => {
    const rewrites: Rewrite[] = [{ path: "A.java", from: '"the bench"', to: '"x"' }];

    expect(() => expurgate([file("A.java", content)], rewrites)).toThrow(/A\.java/);
  });
});

describe("unmarkedBenchComments", () => {
  it.each(["piège", "Pièges", "trap", "TRAPS.md", "XSS", "témoin", "oracle", "scénario", "porte", "banc"])(
    "finds a comment that cites %s without the marker",
    (word) => {
      expect(unmarkedBenchComments("A.java", `// About ${word} here\nclass A {}`)).toHaveLength(1);
    },
  );

  it("accepts the same comment with the marker", () => {
    expect(unmarkedBenchComments("A.java", `// ${BENCH_MARKER} About the trap\nclass A {}`)).toEqual([]);
  });

  it("does not take a word that only contains a bench word for it", () => {
    expect(unmarkedBenchComments("A.java", "// comportement, rapporte, bancaire\nclass A {}")).toEqual([]);
  });
});

describe("workDirRefusal", () => {
  const places = { root: "/repo/migrabench", home: "/Users/someone" };

  it.each(["/repo/migrabench", "/repo/migrabench/tmp/work", "/Users/someone", "/Users/someone/trial"])(
    "refuses %s, inside the repository or the home directory",
    (dest) => {
      expect(workDirRefusal(dest, places)).toMatch(/must be outside/);
    },
  );

  it.each(["/tmp/trial", "/repo/migrabench-other", "/Users/someone-else/trial"])("accepts %s", (dest) => {
    expect(workDirRefusal(dest, places)).toBeUndefined();
  });
});

describe("copyDigest", () => {
  it("does not depend on the order of the files, but on every path and content", () => {
    const a = { path: "a", content: "1" };
    const b = { path: "b", content: "2" };

    expect(copyDigest([a, b])).toBe(copyDigest([b, a]));
    expect(copyDigest([a, b])).not.toBe(copyDigest([a, { path: "b", content: "3" }]));
    expect(copyDigest([a, b])).not.toBe(copyDigest([a, { path: "c", content: "2" }]));
  });
});
