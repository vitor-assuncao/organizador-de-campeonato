const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const connection = require('./db');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:;");
    next();
});

app.get('/campeonatos', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ver_campeonatos.html'));
});

app.get('/criar_campeonato', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'criar_campeonato.html'));
});

app.get('/adicionar_times', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'adicionar_times.html'));
});

app.get('/campeonatos/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'detalhes_campeonato.html'));
});

// Rota para obter os dados detalhados de um campeonato específico
app.get('/api/campeonatos/:id', async (req, res) => {
    const campeonatoId = req.params.id;

    try {
        const [campeonato] = await connection.promise().query(
            `SELECT * FROM Campeonato WHERE campeonato_id = ?`, [campeonatoId]
        );

        const [times] = await connection.promise().query(
            `SELECT * FROM Time WHERE time_id IN (SELECT time_id FROM Desempenho WHERE campeonato_id = ?)`, [campeonatoId]
        );

        const [desempenho] = await connection.promise().query(
            `SELECT d.*, t.nome AS nome_time
             FROM Desempenho d
             JOIN Time t ON d.time_id = t.time_id
             WHERE d.campeonato_id = ?
             ORDER BY d.pontos DESC `, [campeonatoId]

        );

        res.json({ campeonato: campeonato[0], times, desempenho });
    } catch (error) {
        console.error('Erro ao buscar dados do campeonato:', error);
        res.status(500).json({ message: 'Erro ao buscar dados do campeonato', error });
    }
});

const listarCampeonatos = () => {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM Campeonato';
        connection.execute(sql, (err, results) => {
            if (err) {
                return reject(err);
            }
            resolve(results);
        });
    });
};

app.get('/api/campeonatos', async (req, res) => {
    try {
        const campeonatos = await listarCampeonatos();
        res.status(200).json(campeonatos);
    } catch (error) {
        console.error('Erro ao buscar campeonatos:', error);
        res.status(500).json({ message: 'Erro ao buscar campeonatos', error });
    }
});

const inserirCampeonato = (nome, ano, descricao) => {
    return new Promise((resolve, reject) => {
        const sql = 'INSERT INTO Campeonato (nome, ano, descricao) VALUES (?, ?, ?)';
        connection.execute(sql, [nome, ano, descricao], (err, results) => {
            if (err) {
                return reject(err);
            }
            resolve(results.insertId);
        });
    });
};

app.post('/api/campeonatos', async (req, res) => {
    const { nome, ano, descricao } = req.body;
    try {
        const campeonatoId = await inserirCampeonato(nome, ano, descricao);
        res.status(201).json({ id: campeonatoId, message: 'Campeonato criado com sucesso!' });
    } catch (error) {
        console.error('Erro ao criar campeonato:', error);
        res.status(500).json({ message: 'Erro ao criar campeonato', error });
    }
});

app.get('/api/times', async (req, res) => {
    try {
        const [times] = await connection.promise().query(`SELECT * FROM Time`);
        res.json(times);
    } catch (error) {
        console.error('Erro ao buscar times:', error);
        res.status(500).json({ message: 'Erro ao buscar times', error });
    }
});

// Rota para adicionar time, mas impede se já houver jogos
app.post('/api/campeonatos/:campeonatoId/times', async (req, res) => {
    const campeonatoId = req.params.campeonatoId;
    const { timeId } = req.body;

    try {
        const [existingGames] = await connection.promise().query(
            `SELECT * FROM Jogo WHERE campeonato_id = ?`, [campeonatoId]
        );

        if (existingGames.length > 0) {
            return res.status(400).json({ message: 'Não é possível adicionar times após a geração dos jogos.' });
        }

        const sql = `INSERT INTO Desempenho (campeonato_id, time_id) VALUES (?, ?)`;
        await connection.promise().execute(sql, [campeonatoId, timeId]);
        res.status(201).json({ message: 'Time adicionado ao campeonato com sucesso!' });
    } catch (error) {
        console.error('Erro ao adicionar time ao campeonato:', error);
        res.status(500).json({ message: 'Erro ao adicionar time ao campeonato', error });
    }
});

app.post('/api/campeonatos/:campeonatoId/novoTime', async (req, res) => {
    const campeonatoId = req.params.campeonatoId;
    const { nome, cidade, estadio } = req.body;

    try {
        const [existingGames] = await connection.promise().query(
            `SELECT * FROM Jogo WHERE campeonato_id = ?`, [campeonatoId]
        );

        if (existingGames.length > 0) {
            return res.status(400).json({ message: 'Não é possível adicionar times após a geração dos jogos.' });
        }

        const sqlTime = `INSERT INTO Time (nome, cidade, estadio) VALUES (?, ?, ?)`;
        const [result] = await connection.promise().execute(sqlTime, [nome, cidade, estadio]);
        const timeId = result.insertId;

        const sqlDesempenho = `INSERT INTO Desempenho (campeonato_id, time_id) VALUES (?, ?)`;
        await connection.promise().execute(sqlDesempenho, [campeonatoId, timeId]);

        res.status(201).json({ message: 'Novo time criado e adicionado ao campeonato com sucesso!' });
    } catch (error) {
        console.error('Erro ao criar e adicionar novo time ao campeonato:', error);
        res.status(500).json({ message: 'Erro ao criar e adicionar novo time ao campeonato', error });
    }
});

// Função para verificar se a quantidade de times é par
async function verificarQuantidadeDeTimesPar(campeonatoId) {
    const [times] = await connection.promise().query(
        `SELECT COUNT(time_id) AS totalTimes FROM Desempenho WHERE campeonato_id = ?`, [campeonatoId]
    );
    return times[0].totalTimes % 2 === 0;
}

// Função para gerar jogos se eles ainda não existirem
async function gerarJogosParaCampeonato(campeonatoId) {
    const [times] = await connection.promise().query(
        `SELECT time_id, estadio FROM Time WHERE time_id IN (SELECT time_id FROM Desempenho WHERE campeonato_id = ?)`,
        [campeonatoId]
    );

    if (times.length < 2) return;

    const rodadas = [];
    let dataInicial = new Date();
    dataInicial.setDate(dataInicial.getDate() + 7);

    for (let rodada = 0; rodada < (times.length - 1) * 2; rodada++) {
        const jogosRodada = [];
        for (let i = 0; i < times.length / 2; i++) {
            const timeCasa = times[i];
            const timeVisitante = times[times.length - 1 - i];
            jogosRodada.push({
                campeonato_id: campeonatoId,
                time_casa_id: timeCasa.time_id,
                time_visitante_id: timeVisitante.time_id,
                data_jogo: new Date(dataInicial),
                local: timeCasa.estadio
            });
        }
        rodadas.push(jogosRodada);
        times.splice(1, 0, times.pop());
        dataInicial.setDate(dataInicial.getDate() + 7);
    }

    const sql = `INSERT INTO Jogo (campeonato_id, time_casa_id, time_visitante_id, data_jogo, local) VALUES (?, ?, ?, ?, ?)`;
    for (const jogosRodada of rodadas) {
        for (const jogo of jogosRodada) {
            await connection.promise().execute(sql, [
                jogo.campeonato_id,
                jogo.time_casa_id,
                jogo.time_visitante_id,
                jogo.data_jogo,
                jogo.local
            ]);
        }
    }
}

// Rota para gerar jogos (apenas uma vez e com número par de times)
app.post('/api/campeonatos/:campeonatoId/gerar-jogos', async (req, res) => {
    const campeonatoId = req.params.campeonatoId;

    try {
        const quantidadePar = await verificarQuantidadeDeTimesPar(campeonatoId);
        if (!quantidadePar) {
            return res.status(400).json({ message: 'A quantidade de times deve ser par para gerar os jogos.' });
        }

        const [existingGames] = await connection.promise().query(
            `SELECT * FROM Jogo WHERE campeonato_id = ?`, [campeonatoId]
        );

        if (existingGames.length > 0) {
            return res.status(400).json({ message: 'Os jogos já foram gerados para este campeonato.' });
        }

        await gerarJogosParaCampeonato(campeonatoId);
        res.status(201).json({ message: 'Jogos gerados com sucesso!' });
    } catch (error) {
        console.error('Erro ao gerar jogos:', error);
        res.status(500).json({ message: 'Erro ao gerar jogos', error });
    }
});

app.get('/api/campeonatos/:campeonatoId/jogos', async (req, res) => {
    const campeonatoId = req.params.campeonatoId;

    try {
        const [jogos] = await connection.promise().query(`
            SELECT Jogo.jogo_id,             -- Incluindo o ID do jogo
                   Jogo.data_jogo, 
                   Jogo.local,
                   casa.nome AS time_casa_nome,
                   visitante.nome AS time_visitante_nome
            FROM Jogo
            JOIN Time AS casa ON Jogo.time_casa_id = casa.time_id
            JOIN Time AS visitante ON Jogo.time_visitante_id = visitante.time_id
            WHERE Jogo.campeonato_id = ?
            ORDER BY Jogo.data_jogo ASC
        `, [campeonatoId]);

        res.json({ jogos });
    } catch (error) {
        console.error('Erro ao buscar jogos do campeonato:', error);
        res.status(500).json({ message: 'Erro ao buscar jogos do campeonato', error });
    }
});


// Rota para obter jogos de uma rodada específica
app.get('/api/campeonatos/:campeonatoId/rodadas/:rodadaId', async (req, res) => {
    const { campeonatoId, rodadaId } = req.params;

    try {
        const [jogos] = await connection.promise().query(`
            SELECT Jogo.jogo_id, Jogo.data_jogo, Jogo.gols_casa, Jogo.gols_visitante,
                   casa.nome AS time_casa_nome, visitante.nome AS time_visitante_nome
            FROM Jogo
            JOIN Time AS casa ON Jogo.time_casa_id = casa.time_id
            JOIN Time AS visitante ON Jogo.time_visitante_id = visitante.time_id
            WHERE Jogo.campeonato_id = ? AND Jogo.rodada_id = ?
        `, [campeonatoId, rodadaId]);

        res.json({ jogos });
    } catch (error) {
        console.error('Erro ao buscar jogos da rodada:', error);
        res.status(500).json({ message: 'Erro ao buscar jogos da rodada', error });
    }
});

// Rota para obter todos os jogos de um campeonato
app.get('/api/campeonatos/:campeonatoId/jogos', async (req, res) => {
    const campeonatoId = req.params.campeonatoId;

    try {
        const [jogos] = await connection.promise().query(`
            SELECT Jogo.jogo_id, Jogo.data_jogo, Jogo.gols_casa, Jogo.gols_visitante,
                   casa.nome AS time_casa_nome, visitante.nome AS time_visitante_nome
            FROM Jogo
            JOIN Time AS casa ON Jogo.time_casa_id = casa.time_id
            JOIN Time AS visitante ON Jogo.time_visitante_id = visitante.time_id
            WHERE Jogo.campeonato_id = ?
            ORDER BY Jogo.data_jogo ASC
        `, [campeonatoId]);

        res.json({ jogos });
    } catch (error) {
        console.error('Erro ao buscar jogos do campeonato:', error);
        res.status(500).json({ message: 'Erro ao buscar jogos do campeonato', error });
    }
});

// Rota para atualizar o placar de um jogo e o desempenho dos times
app.post('/api/jogos/:jogoId/atualizar_placar', async (req, res) => {
    const { jogoId } = req.params;
    const { golsCasa, golsVisitante } = req.body;

    if (!jogoId || isNaN(golsCasa) || isNaN(golsVisitante)) {
        return res.status(400).json({ message: 'Dados inválidos' });
    }

    try {
        // Obter informações do jogo (campeonato_id e times envolvidos)
        const [jogo] = await connection.promise().query(`
            SELECT campeonato_id, time_casa_id, time_visitante_id, gols_casa, gols_visitante
            FROM Jogo
            WHERE jogo_id = ?
        `, [jogoId]);

        if (!jogo.length) {
            return res.status(404).json({ message: 'Jogo não encontrado' });
        }

        const { campeonato_id, time_casa_id, time_visitante_id } = jogo[0];

        // Atualizar o placar do jogo
        await connection.promise().execute(`
            UPDATE Jogo
            SET gols_casa = ?, gols_visitante = ?
            WHERE jogo_id = ?
        `, [golsCasa, golsVisitante, jogoId]);

        // Calcular o resultado e os pontos para cada time
        let pontosCasa = 0;
        let pontosVisitante = 0;

        if (golsCasa > golsVisitante) {
            pontosCasa = 3; // Vitória do time da casa
        } else if (golsCasa < golsVisitante) {
            pontosVisitante = 3; // Vitória do time visitante
        } else {
            pontosCasa = 1; // Empate
            pontosVisitante = 1;
        }

        // Atualizar desempenho do time da casa
        await atualizarDesempenho(
            time_casa_id,
            campeonato_id,
            golsCasa,       // Gols marcados
            golsVisitante,  // Gols sofridos
            pontosCasa      // Pontos ganhos
        );

        // Atualizar desempenho do time visitante
        await atualizarDesempenho(
            time_visitante_id,
            campeonato_id,
            golsVisitante,  // Gols marcados
            golsCasa,       // Gols sofridos
            pontosVisitante // Pontos ganhos
        );

        res.json({ message: 'Placar e desempenho atualizados com sucesso!' });
    } catch (error) {
        console.error('Erro ao atualizar placar:', error);
        res.status(500).json({ message: 'Erro ao atualizar placar e desempenho das equipes.', error });
    }
});


async function atualizarDesempenho(timeId, campeonatoId, golsPro, golsContra, pontos) {
    const [desempenho] = await connection.promise().query(`
        SELECT * FROM Desempenho
        WHERE time_id = ? AND campeonato_id = ?
    `, [timeId, campeonatoId]);

    if (desempenho.length > 0) {
        // Atualizar o desempenho existente
        const resultado = pontos === 3 ? 'vitorias' : pontos === 1 ? 'empates' : 'derrotas';

        await connection.promise().execute(`
            UPDATE Desempenho
            SET jogos = jogos + 1,
                ${resultado} = ${resultado} + 1,
                gols_pro = gols_pro + ?,
                gols_contra = gols_contra + ?,
                pontos = pontos + ?
            WHERE time_id = ? AND campeonato_id = ?
        `, [golsPro, golsContra, pontos, timeId, campeonatoId]);
    } else {
        // Inserir novo registro de desempenho
        await connection.promise().execute(`
            INSERT INTO Desempenho (time_id, campeonato_id, jogos, vitorias, empates, derrotas, gols_pro, gols_contra, pontos)
            VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
        `, [
            timeId,
            campeonatoId,
            pontos === 3 ? 1 : 0, // Vitórias
            pontos === 1 ? 1 : 0, // Empates
            pontos === 0 ? 1 : 0, // Derrotas
            golsPro,
            golsContra,
            pontos
        ]);
    }
}


app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
