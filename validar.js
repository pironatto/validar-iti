const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { PDFDocument } = require("pdf-lib");

const URL = "https://validar.iti.gov.br/";
const EXTENSOES_VALIDAS = new Set([".pdf", ".p7s", ".xml"]);
const LIMITE = 10;

const args = process.argv.slice(2);
const arquivoUnico = args[0];
const pastaSaidaArg = args[1];

const PASTA_ENTRADA = "./entrada";
const PASTA_SAIDA = pastaSaidaArg || "./saida";

// Função para abrir o Chromium distribuído junto
async function abrirBrowser() {
    // Caminho direto para o Chromium completo
    const navegadorPath = path.resolve(__dirname, ".playwright/chromium-1208/chrome-win64/chrome.exe");

    if (!fs.existsSync(navegadorPath)) {
        throw new Error(`Chromium não encontrado no pacote distribuído em: ${navegadorPath}`);
    }

    return await chromium.launch({
        headless: true,
        executablePath: navegadorPath
    });
}


async function validarArquivo(page, arquivo) {
    const base = path.parse(arquivo).name;
    console.log(`→ Validando: ${arquivo}`);

    try {
        await page.goto(URL, { waitUntil: "domcontentloaded" });

        // Upload
        let inputFile = page.locator("#signature_files");
        if (!(await inputFile.count())) {
            inputFile = page.locator("#signature_filesDetached");
        }
        await inputFile.setInputFiles(arquivo);

        // Aceitar termos
        const termosCheckbox = page.locator("#acceptTerms");
        if (await termosCheckbox.count()) {
            if (!(await termosCheckbox.isChecked())) {
                await termosCheckbox.check();
            }
        }

        // Modal opcional
        const modalConfirmBtn = page.locator(".swal2-actions button");
        if (await modalConfirmBtn.count()) {
            await modalConfirmBtn.first().click();
            await page.waitForSelector(".swal2-container", { state: "detached" });
        }

        await page.locator("#validateSignature").click();

        // Espera até 5 segundos para ver se apareceu erro
        try {

            await page.locator(".swal2-popup").waitFor({
                state: "visible",
                timeout: 5000
            });

            const mensagem = await page
                .locator(".swal2-html-container")
                .innerText();

            fs.writeFileSync(
                `${PASTA_SAIDA}/${base}__falha.txt`,
                mensagem,
                "utf8"
            );

            console.log(`✖ Documento rejeitado: ${base}`);
            return;

        } catch {
            // Nenhum popup apareceu
        }

        // então segue para o relatório normal
        await page.waitForURL("**/relatorio.html");
        


        // Aguarda assinaturas
        await page.waitForSelector("#assinaturas", { state: "visible", timeout: 15000 });

        const textoPagina = await page.locator("#containerDoc").innerText();

        const possuiErroDeValidacao =
            textoPagina.includes("Assinatura indeterminada") ||
            textoPagina.includes("certificados expirados") ||
            textoPagina.includes("Verifique o relatório de conformidade");

        // Realce
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

        // Captura apenas o relatório
        const screenshotBuffer = await page.locator("#containerDoc").screenshot();

        // PDF
        const pdfDoc = await PDFDocument.create();
        const pdfPage = pdfDoc.addPage();
        const pngImage = await pdfDoc.embedPng(screenshotBuffer);
        const { width, height } = pngImage.scale(1);
        pdfPage.setSize(width, height);
        pdfPage.drawImage(pngImage, { x: 0, y: 0, width, height });

        const destinoPDF = possuiErroDeValidacao
            ? `${PASTA_SAIDA}/${base}__ERRO.pdf`
            : `${PASTA_SAIDA}/${base}__relatorio.pdf`;
        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync(destinoPDF, pdfBytes);

        console.log(` ✔ Relatório salvo em PDF: ${destinoPDF}`);
    } catch (err) {
        console.error(`✖ Erro ao validar ${arquivo}:`, err);
        fs.writeFileSync(`${PASTA_SAIDA}/${base}__erro.log`, err.stack || err.message, "utf8");
    }
}

async function main() {
    let arquivos;

    if (arquivoUnico) {
        arquivos = [arquivoUnico];
    } else {
        arquivos = fs
            .readdirSync(PASTA_ENTRADA)
            .filter(f => EXTENSOES_VALIDAS.has(path.extname(f).toLowerCase()))
            .slice(0, LIMITE)
            .map(f => path.join(PASTA_ENTRADA, f));
    }

    if (!arquivos.length) {
        console.log("Nenhum arquivo válido encontrado.");
        return;
    }

    console.log(`\nValidando ${arquivos.length} documento(s)...\n`);

    const browser = await abrirBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.addInitScript(() => {
        localStorage.setItem("cake", "off");
    });

    for (const arquivo of arquivos) {
        await validarArquivo(page, arquivo);
    }

    await browser.close();
    console.log("\n✔ Processo concluído!\n");
}

main();
