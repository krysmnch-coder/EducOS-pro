const readline = require('readline');
const bcrypt = require('bcrypt');
const db = require('../src/models/db');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let answer = '';

    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = () => {
      stdin.setRawMode(wasRaw || false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = chunk => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Opération annulée.'));
          return;
        }

        if (character === '\r' || character === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(answer);
          return;
        }

        if (character === '\u0008' || character === '\u007f') {
          if (answer.length > 0) {
            answer = answer.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }

        answer += character;
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  const email = (await ask('E-mail du superadmin : ')).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Adresse e-mail invalide.');
  }

  const password = await askHidden('Mot de passe : ');
  const confirmation = await askHidden('Confirmer le mot de passe : ');
  if (password.length < 12) {
    throw new Error('Le mot de passe doit contenir au moins 12 caractères.');
  }
  if (password !== confirmation) {
    throw new Error('Les mots de passe ne correspondent pas.');
  }

  const existingUser = await db('users').where({ email }).first();
  if (existingUser) {
    throw new Error('Cet e-mail est déjà utilisé.');
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const [createdUser] = await db('users').insert({
    name: 'Super Administrateur',
    email,
    password: hashedPassword,
    role: 'superadmin',
    approved: 1,
    establishment_id: null,
    avatar_url: '/img/user.png',
    password_reset_required: false
  }).returning('id');

  const userId = createdUser && typeof createdUser === 'object' ? createdUser.id : createdUser;
  console.log(`Compte superadmin créé avec succès (id: ${userId}).`);
}

main()
  .catch(error => {
    console.error(`Erreur : ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());