// src/db/queries/auth.queries.ts

export const AuthQueries = {
    
    FIND_BY_EMAIL_WITH_RELATIONS: `
        SELECT 
            u.id,
            u.nome,
            u.email,
            u.senha_hash,
            u.empresa_id,
            e.nome AS empresa_nome,
            e.status AS empresa_status,
            n.nome AS role_nome
        FROM usuarios u
        INNER JOIN empresas e ON u.empresa_id = e.id
        INNER JOIN niveis_acesso n ON u.nivel_acesso_id = n.id
        WHERE u.email = $1
        LIMIT 1;
    `,

    CREATE_USER: `
        INSERT INTO usuarios (
            empresa_id,
            nivel_acesso_id,
            nome,
            email,
            senha_hash,
            telefone
        ) VALUES (
            $1, 
            (SELECT id FROM niveis_acesso WHERE nome = $2 LIMIT 1), 
            $3, 
            $4, 
            $5, 
            $6
        )
        RETURNING id, nome, email, data_cadastro;
    `,

    UPDATE_LAST_LOGIN: `
        UPDATE usuarios 
        SET ultimo_acesso = NOW() -- CORRIGIDO (Era ultimo_login)
        WHERE id = $1;
    `,

    CHECK_EMAIL_EXISTS: `
        SELECT id FROM usuarios 
        WHERE email = $1 
        LIMIT 1;
    `
};