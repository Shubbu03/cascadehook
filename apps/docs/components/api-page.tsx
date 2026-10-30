"use client";

import { createOpenAPIPageBase } from "fumadocs-openapi/ui/base";
import { createCodeUsageGeneratorRegistry } from "fumadocs-openapi/requests/generators";
import { curl } from "fumadocs-openapi/requests/generators/curl";
import { javascript } from "fumadocs-openapi/requests/generators/javascript";
import { createShikiHighlighter } from "fumadocs-core/highlight/shiki";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import http from "shiki/langs/http.mjs";
import js from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import ts from "shiki/langs/typescript.mjs";
import dark from "shiki/themes/github-dark.mjs";
import light from "shiki/themes/github-light.mjs";

const highlighter = createHighlighterCore({
  themes: [light, dark],
  langs: [bash, http, js, json, ts],
  engine: createJavaScriptRegexEngine(),
});
const codeUsages = createCodeUsageGeneratorRegistry();
codeUsages.add("curl", curl);
codeUsages.add("js", javascript);

export const OpenAPIPage = createOpenAPIPageBase({
  highlighter: createShikiHighlighter(() => highlighter, {
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  }),
  codeUsages,
  playground: { enabled: false },
});
