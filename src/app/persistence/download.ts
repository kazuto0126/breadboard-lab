export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  downloadBlob(filename, new Blob([text], { type: `${type};charset=utf-8` }));
}

/** 開啟選檔視窗，讀出文字內容；使用者取消時回傳 null。 */
export function pickTextFile(accept = '.json,application/json'): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener(
      'change',
      async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) {
          resolve(null);
          return;
        }
        resolve({ name: file.name, text: await file.text() });
      },
      { once: true },
    );
    input.addEventListener(
      'cancel',
      () => {
        input.remove();
        resolve(null);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}
