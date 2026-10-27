import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { pool } from './db.js';
dotenv.config();
const rl=readline.createInterface({input,output});
try {
  const full_name=(await rl.question('Nombre completo: ')).trim();
  const email=(await rl.question('Correo: ')).trim().toLowerCase();
  const password=await rl.question('Contraseña (mínimo 10 caracteres): ');
  if(!full_name||!email||password.length<10) throw new Error('Datos inválidos. La contraseña debe tener al menos 10 caracteres.');
  const hash=await bcrypt.hash(password,12);
  const [result]=await pool.execute('INSERT INTO users(full_name,email,password_hash,role) VALUES(?,?,?,?)',[full_name,email,hash,'administrador_general']);
  console.log(`Administrador general creado. ID: ${result.insertId}`);
} catch(e){console.error('No se pudo crear el administrador:',e.message);}
finally {rl.close();await pool.end();}
