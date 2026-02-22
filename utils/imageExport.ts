
/**
 * Utility per convertire un SVG in PNG e scaricarlo
 * @param containerId L'ID del container che contiene l'elemento SVG
 * @param fileName Il nome del file da scaricare
 * @param size La dimensione dell'immagine quadrata in pixel (default 512)
 */
export const downloadLogoAsPng = (containerId: string, fileName: string = 'brewpanda_icon.png', size: number = 512) => {
    const container = document.getElementById(containerId);
    const svg = container?.querySelector('svg');
    
    if (!svg) {
        console.error("SVG non trovato nel container specificato");
        return;
    }

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        canvas.width = size;
        canvas.height = size;
        
        // Pulizia sfondo (opzionale, qui trasparente)
        ctx.clearRect(0, 0, size, size);
        
        // Disegno dell'immagine sul canvas
        ctx.drawImage(img, 0, 0, size, size);
        
        // Conversione in PNG e download
        try {
            const pngUrl = canvas.toDataURL('image/png');
            const downloadLink = document.createElement('a');
            downloadLink.href = pngUrl;
            downloadLink.download = fileName;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        } catch (err) {
            console.error("Errore durante la generazione del PNG:", err);
        } finally {
            URL.revokeObjectURL(url);
        }
    };

    img.onerror = () => {
        console.error("Errore nel caricamento dell'immagine SVG");
        URL.revokeObjectURL(url);
    };

    img.src = url;
};
