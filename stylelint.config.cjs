module.exports = {
  extends: ["./tooling/stylelint/index.cjs"],
  ignoreFiles: ["**/node_modules/**", "**/dist/**", "**/.turbo/**", "**/coverage/**"],
};
