/** 跨平台调用系统命令打开默认浏览器（macOS / Windows / Linux） */
export async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? ["open", url] : platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];

  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    console.log(`无法自动打开浏览器，请手动访问：\n${url}`);
  }
}
