CREATE TABLE IF NOT EXISTS users (
    id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    srp_salt VARCHAR(1000) NOT NULL,
    srp_verifier VARCHAR(1000) NOT NULL,
    totp_secret VARCHAR(255),
    created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(1000) NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(255) NOT NULL,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS vaults (
    id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    master_password_salt VARCHAR(1000) NOT NULL,
    encrypted_user_id VARCHAR(1000) NOT NULL,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vault_access (
    user_id INT NOT NULL REFERENCES users(id),
    vault_id INT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    role VARCHAR(255) NOT NULL,
    PRIMARY KEY (user_id, vault_id)
);

CREATE TABLE IF NOT EXISTS passwords (
    id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vault_id INT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    data BYTEA NOT NULL,
    iv VARCHAR(1000) NOT NULL,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP
);
