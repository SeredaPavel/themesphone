### 'docker_dsta_bd'

 docker run -d --name container_wallpaper_shop -e POSTGRES_USER=XXXXXXX -e POSTGRES_PASSWORD=XXXXXXX -e POSTGRES_DB=wallpaper_shop -v C:\Users\filkm\Projects\wallpaper_shop\data_db:/var/lib/postgresql/data -p 5432:5432 postgres

### Имя_сайта

ThemesPhone

### Команды
git add .
git commit -m "-------------"
git log --oneline

### 1. Ветка (Branch)
`On branch master` - вы находитесь в ветке `master` (главная ветка по умолчанию).

### 2. Изменения, не подготовленные к коммиту (Changes not staged for commit)
Git сообщает, что следующие файлы были изменены, но не добавлены в индекс (staging area) для будущего коммита:

- `modified` означает, что файлы были изменены по сравнению с последним коммитом.
  - `git add <file>` - добавить изменения в индекс для следующего коммита
  - `git restore <file>` - отменить изменения (вернуть к состоянию последнего коммита)

### 3. Неотслеживаемые файлы (Untracked files)
Эти файлы и папки существуют в вашей рабочей директории, но Git ещё не отслеживает их:
- Git предлагает использовать `git add <file>`, если вы хотите начать отслеживать эти файлы.

### 4. Общее состояние
`no changes added to commit` - означает, что пока нет изменений, добавленных в индекс для коммита.

### Что можно сделать дальше:
1. **Добавить изменения в индекс**:
   
   git add <file>  # для конкретного файла
   git add .       # все изменения и новые файлы
   
2. **Сделать коммит** после добавления:
   
   git commit -m "Ваше сообщение коммита"
  
3. **Отменить изменения** в конкретном файле (если нужно):
    
    git restore <file>
   
4. **Просмотреть изменения** перед добавлением:
   
   git diff       # для изменённых файлов
   git status     # текущее состояние (это то, что вы видите сейчас)

Чтобы посмотреть список коммитов в вашем Git-репозитории, можно использовать несколько команд.  

### **1. Основная команда — `git log`**  
Показывает историю коммитов в текущей ветке:  

git log

**Вывод:**  
- Хеш коммита (например, `commit a1b2c3d4...`)  
- Автор (`Author: имя <email>`)  
- Дата (`Date: ...`)  
- Сообщение коммита  

**Дополнительные флаги:**  
- `--oneline` — сокращённый вывод (только хеш и сообщение):  

  git log --oneline

- `--graph` — визуализирует ветвление (удобно для сложных историй):  

  git log --graph --oneline

- `-p` или `--patch` — показывает изменения в каждом коммите:  

  git log -p

### **2. Просмотр коммитов в других ветках**  
- Посмотреть все коммиты во **всех ветках**:  

  git log --all

- Посмотреть коммиты в конкретной ветке (например, `main`):  

  git log main

### **3. Поиск коммитов по автору, дате или сообщению**  
- Фильтрация по автору:  

  git log --author="Имя"  # Например, --author="John"

- Коммиты за последние N дней:  

  git log --since="2 days ago"
 
- Поиск по сообщению коммита:  
  
  git log --grep="текст"  # Например, --grep="fix bug"

### **4. Красивое отображение (`git pretty log`)**  
Можно настроить формат вывода, например:  

git log --pretty=format:"%h - %an, %ar : %s"
 
Где:  
- `%h` — сокращённый хеш  
- `%an` — автор  
- `%ar` — дата в относительном формате  
- `%s` — сообщение коммита  

### **5. Просмотр изменений в коммите**  
Если нужно посмотреть, какие файлы изменились в конкретном коммите:  

git show <хеш_коммита>  # Например, git show a1b2c3d

Remove-Item -Recurse -Force .cache, build

DELETE FROM strapi_core_store_settings 
WHERE key = 'plugin_users-permissions_email';

### Рекомендованные значения для вкладки "Email address confirmation"

| Поле               | Что вписать                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| **Shipper name**   | `ThemesPhone`                                                          |
| **Shipper email**  | `noreply.themesphone@yandex.ru` *(или другой адрес с SMTP-провайдера)* |
| **Response email** | `support@themesphone.ru` *(или можно оставить пустым)*                 |
| **Subject**        | `Подтвердите регистрацию на ThemesPhone`                               |
| **Message**        |  <p>Здравствуйте!</p>
                        <p>Спасибо за регистрацию на <strong>ThemesPhone</strong>.</p>
                        <p>Пожалуйста, подтвердите ваш email:</p>

                        <p>href="<%= URL %>?confirmation=<%= CODE %>" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline; cursor: pointer;"></p>

                        <p>Если вы не регистрировались — просто проигнорируйте это письмо.</p>
                        <p>С уважением,<br>Команда ThemesPhone</p>                                              |


