export async function uploadFile(file: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/uploads', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.url as string;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error('File upload failed');
  }
}

export async function uploadFiles(files: File[]): Promise<string[]> {
  try {
    const uploadPromises = files.map(file => uploadFile(file));
    return await Promise.all(uploadPromises);
  } catch (error) {
    console.error('Error uploading files:', error);
    throw new Error('Batch upload failed');
  }
}
