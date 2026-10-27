CREATE DATABASE IF NOT EXISTS balso_flota CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE balso_flota;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('administrador_general','administrador','conductor') NOT NULL DEFAULT 'conductor',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plate VARCHAR(20) NOT NULL UNIQUE,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(150) NOT NULL,
  year SMALLINT NULL,
  vin VARCHAR(80) NULL,
  engine VARCHAR(100) NULL,
  owner_name VARCHAR(190) NULL,
  site VARCHAR(120) NULL,
  assigned_driver VARCHAR(190) NULL,
  current_km DECIMAL(12,2) NOT NULL DEFAULT 0,
  historical_gallons DECIMAL(12,4) NOT NULL DEFAULT 0,
  historical_fuel_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  historical_efficiency DECIMAL(10,2) NULL,
  mechanical_status ENUM('green','yellow','red','gray') NOT NULL DEFAULT 'gray',
  document_status ENUM('green','yellow','red','gray') NOT NULL DEFAULT 'gray',
  notes TEXT NULL,
  image_data MEDIUMTEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS maintenance_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_plate VARCHAR(20) NOT NULL,
  item VARCHAR(160) NOT NULL,
  specification TEXT NULL,
  capacity VARCHAR(100) NULL,
  interval_text VARCHAR(160) NULL,
  confidence VARCHAR(60) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_maintenance_vehicle FOREIGN KEY (vehicle_plate) REFERENCES vehicles(plate)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vehicle_documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vehicle_plate VARCHAR(20) NOT NULL,
  document_name VARCHAR(200) NOT NULL,
  status ENUM('green','yellow','red','gray') NOT NULL DEFAULT 'gray',
  action_required TEXT NULL,
  checked_at DATE NULL,
  evidence_url VARCHAR(500) NULL,
  responsible_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_document_vehicle FOREIGN KEY (vehicle_plate) REFERENCES vehicles(plate)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_document_user FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS driver_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  vehicle_plate VARCHAR(20) NOT NULL,
  driver_name VARCHAR(160) NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  odometer_km DECIMAL(12,2) NOT NULL,
  route VARCHAR(200) NULL,
  gallons DECIMAL(10,3) NOT NULL DEFAULT 0,
  fuel_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  observations TEXT NULL,
  status ENUM('green','yellow','red') NOT NULL,
  failed_checks JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_record_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_record_vehicle FOREIGN KEY (vehicle_plate) REFERENCES vehicles(plate),
  INDEX idx_records_date (recorded_at),
  INDEX idx_records_plate (vehicle_plate)
);

CREATE TABLE IF NOT EXISTS record_checklist (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  record_id BIGINT UNSIGNED NOT NULL,
  item_name VARCHAR(100) NOT NULL,
  passed BOOLEAN NOT NULL,
  CONSTRAINT fk_checklist_record FOREIGN KEY (record_id) REFERENCES driver_records(id) ON DELETE CASCADE
);
