Neutralino.init();

let selectedFiles = [];
let outputFolder = "";
let barra = document.getElementById("barra"); // certifique-se que existe um <progress id="barra">

async function chooseDocs() {
    try {
        const result = await Neutralino.os.showOpenDialog("Selecione documentos", {
            filters: [{ name: "Documentos", extensions: ["pdf", "p7s", "xml"] }],
            multiSelections: true
        });
        if (result && result.length > 0) {
            selectedFiles = result;
            document.getElementById("status").innerText = `Selecionados ${selectedFiles.length} arquivos.`;
            document.getElementById("iniciar").disabled = !outputFolder;
        }
    } catch (err) {
        document.getElementById("status").innerText = "Erro ao abrir diálogo: " + err.message;
    }
}

async function chooseOutput() {
    try {
        const result = await Neutralino.os.showFolderDialog("Escolha a pasta de saída");
        if (result) {
            outputFolder = result;
            document.getElementById("status").innerText = `Saída definida: ${outputFolder}`;
            document.getElementById("iniciar").disabled = selectedFiles.length === 0;
        }
    } catch (err) {
        document.getElementById("status").innerText = "Erro ao abrir diálogo: " + err.message;
    }
}

async function startValidation() {
    if (selectedFiles.length === 0 || !outputFolder) {
        document.getElementById("status").innerText = "Selecione arquivos e pasta de saída primeiro.";
        return;
    }
    document.getElementById("iniciar").disabled = true;
    document.getElementById("abrirEntrada").disabled = true;
    document.getElementById("abrirSaida").disabled = true;

    let total = selectedFiles.length;
    let processed = 0;

    barra.removeAttribute("value");
    barra.classList.add("indeterminate");
    document.getElementById("status").innerText = "Preparando validação...";

    for (const file of selectedFiles) {
        const cmd = `"${NL_PATH}/node/node.exe" "${NL_PATH}/validar.js" "${file}" "${outputFolder}"`;
        try {
            let result = await Neutralino.os.execCommand(cmd);

             barra.classList.remove("indeterminate");
            barra.value = 0;
            barra.max = 100;

            processed++;
            let percent = Math.round((processed / total) * 100);
            barra.value = percent;

            if (result.stdErr) {
                document.getElementById("status").innerText = `Erro ao processar ${file}`;
            } else {
                document.getElementById("status").innerText = `Processados ${processed}/${total}`;
            }
        } catch (err) {
            await Neutralino.os.showMessageBox("Erro", err.message);
        }
    }

    document.getElementById("status").innerText = "✔ Validação concluída!";
    document.getElementById("iniciar").disabled = false;
    document.getElementById("abrirEntrada").disabled = false;
    document.getElementById("abrirSaida").disabled = false;

}

document.getElementById("abrirEntrada").addEventListener("click", chooseDocs);
document.getElementById("abrirSaida").addEventListener("click", chooseOutput);
document.getElementById("iniciar").addEventListener("click", startValidation);
