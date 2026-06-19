// src/db/queries/empresa.queries.ts

export const EmpresaQueries = {
    
    CREATE: `
        INSERT INTO empresas (nome, documento, email, telefone, status)
        VALUES ($1, $2, $3, $4, 'ativo')
        RETURNING id, nome, email, status, data_cadastro;
    `,

    CHECK_EXISTS: `
        SELECT id FROM empresas 
        WHERE documento = $1 OR email = $2 
        LIMIT 1;
    `,

    LIST_ALL: `
        SELECT 
            e.id, 
            e.nome, 
            e.documento, 
            e.email, 
            e.telefone,
            e.status,
            e.data_cadastro, 
            (SELECT COUNT(*)::int FROM usuarios u WHERE u.empresa_id = e.id) as total_usuarios
        FROM empresas e
        ORDER BY e.data_cadastro DESC;
    `,

    FIND_BY_ID: `
        SELECT * FROM empresas WHERE id = $1;
    `,

    UPDATE: `
        UPDATE empresas 
        SET 
            nome = $1, 
            email = $2, 
            documento = $3, 
            telefone = $4,
            data_atualizacao = NOW()
        WHERE id = $5 
        RETURNING *;
    `,

    UPDATE_STATUS: `
        UPDATE empresas 
        SET status = $1, data_atualizacao = NOW() 
        WHERE id = $2 
        RETURNING id, nome, email, status;
    `,
    
    DELETE: `DELETE FROM empresas WHERE id = $1 RETURNING id`
};