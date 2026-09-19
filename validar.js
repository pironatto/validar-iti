const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { PDFDocument } = require("pdf-lib");

const URL = "https://validar.iti.gov.br/";

async function abrirBrowser() {
    const navegadorPath = path.resolve(__dirname, ".playwright/chromium-1208/chrome-win64/chrome.exe");
    if (!fs.existsSync(navegadorPath)) {
        throw new Error(`Chromium não encontrado em: ${navegadorPath}`);
    }
    return await chromium.launch({
        headless: true,
        executablePath: navegadorPath
    });
}

async function validarArquivo(browser, arquivo, pastaSaida) {
    const base = path.parse(arquivo).name;
    console.log(`→ Validando arquivo: ${arquivo}`);

    // Abre uma nova aba diretamente no navegador único
    const page = await browser.newPage();

    await page.addInitScript(() => {
        localStorage.setItem("cake", "off");
    });

    try {
        await page.goto(URL, { waitUntil: "domcontentloaded" });

        let inputFile = page.locator("#signature_files");
        if (!(await inputFile.count())) {
            inputFile = page.locator("#signature_filesDetached");
        }
        await inputFile.setInputFiles(arquivo);

        const termosCheckbox = page.locator("#acceptTerms");
        if (await termosCheckbox.count()) {
            if (!(await termosCheckbox.isChecked())) {
                await termosCheckbox.check();
            }
        }

        const modalConfirmBtn = page.locator(".swal2-actions button");
        if (await modalConfirmBtn.count()) {
            await modalConfirmBtn.first().click();
            await page.waitForSelector(".swal2-container", { state: "detached" });
        }

        await page.locator("#validateSignature").click();

        try {
            await page.locator(".swal2-popup").waitFor({
                state: "visible",
                timeout: 5000
            });
            const mensagem = await page.locator(".swal2-html-container").innerText();
            fs.writeFileSync(path.join(pastaSaida, `${base}__falha.txt`), mensagem, "utf8");
            console.log(`✖ Rejeitado: ${base}`);
            return;
        } catch { }

        await page.waitForURL("**/relatorio.html");
        await page.waitForSelector("#assinaturas", { state: "visible", timeout: 15000 });

        const textoPagina = await page.locator("#containerDoc").innerText();
        const possuiErroDeValidacao =
            textoPagina.includes("Assinatura indeterminada") ||
            textoPagina.includes("certificados expirados") ||
            textoPagina.includes("Verifique o relatório de conformidade");

        await page.evaluate(() => {
            const el = document.querySelector("#assinaturas");
            if (el) {
                el.style.backgroundColor = "rgba(255,255,255,0.8)";
                el.style.color = "#444";
                el.style.filter = "contrast(200%) saturate(150%)";
                el.style.fontWeight = "600";
                el.style.fontSize = "14px";
                el.style.border = "1px solid #ccc";
                el.style.borderRadius = "6px";
                el.style.padding = "6px 8px";
            }
        });
        await page.waitForTimeout(1000);

        const screenshotBuffer = await page.locator("#containerDoc").screenshot();

        const pdfDoc = await PDFDocument.create();
        const pdfPage = pdfDoc.addPage();
        const pngImage = await pdfDoc.embedPng(screenshotBuffer);
        const { width, height } = pngImage.scale(1);
        pdfPage.setSize(width, height);
        pdfPage.drawImage(pngImage, { x: 0, y: 0, width, height });

        const destinoPDF = possuiErroDeValidacao
            ? path.join(pastaSaida, `${base}__ERRO.pdf`)
            : path.join(pastaSaida, `${base}__relatorio.pdf`);

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(destinoPDF, pdfBytes);
        console.log(`✔ Salvo: ${destinoPDF}`);
    } catch (err) {
        console.error(`✖ Erro em ${base}:`, err.message);
        fs.writeFileSync(path.join(pastaSaida, `${base}__erro.log`), err.stack || err.message, "utf8");
    } finally {
        await page.close(); // Fecha apenas a aba ao terminar
    }
}

async function main() {
    let arquivos = [];
    let pastaSaida = "./saida";

    try {
        const configPath = path.join(process.cwd(), ".lista.json");
        if (fs.existsSync(configPath)) {
            const data = JSON.parse(fs.readFileSync(configPath, "utf8"));
            arquivos = data.files || [];
            pastaSaida = data.outputFolder || pastaSaida;
        }
    } catch (e) {
        console.error("Erro ao ler JSON:", e);
        return;
    }

    if (!arquivos.length) {
        console.log("Nenhum arquivo encontrado.");
        return;
    }

    // Abre o navegador APENAS UMA VEZ
    const browser = await abrirBrowser();

    const limiteConcorrencia = 5; // Mantém exatamente 5 abas ativas em simultâneo
    let index = 0;

    async function worker() {
        while (index < arquivos.length) {
            const currentIndex = index++;
            const arquivo = arquivos[currentIndex];
            await validarArquivo(browser, arquivo, pastaSaida);
        }
    }

    const trabalhadores = [];
    const numTrabalhadores = Math.min(limiteConcorrencia, arquivos.length);

    for (let i = 0; i < numTrabalhadores; i++) {
        trabalhadores.push(worker());
    }

    await Promise.all(trabalhadores);
    await browser.close(); // Fecha o navegador único no fim de tudo
    console.log("✔ Todas as validações finalizadas!");
}

main();