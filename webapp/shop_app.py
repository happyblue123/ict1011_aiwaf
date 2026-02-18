from flask import Flask, request, render_template_string, redirect, url_for, session, jsonify
import sqlite3
import subprocess # Needed for Command Injection
import platform
import requests as req_lib  # Needed for SSRF

app = Flask(__name__)
app.secret_key = 'super_secret_key'
DB_FILE = "shop.db"

# --- DATABASE SETUP ---
def init_db():
    conn = sqlite3.connect('shop.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT, price INTEGER, desc TEXT, image TEXT)''')
    # NEW: Reviews Table for Stored XSS
    c.execute('''CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY, product_id INTEGER, user TEXT, comment TEXT)''')

    if c.execute("SELECT count(*) FROM users").fetchone()[0] == 0:
        c.execute("INSERT INTO users (username, password) VALUES ('admin', 'password123')")
        c.execute("INSERT INTO users (username, password) VALUES ('john', 'securepass')")

    if c.execute("SELECT count(*) FROM products").fetchone()[0] == 0:
        c.execute("INSERT INTO products (name, price, desc, image) VALUES ('The AI Sentinel', 59, 'Mastering Adversarial Machine Learning.', '🤖')")
        c.execute("INSERT INTO products (name, price, desc, image) VALUES ('Black Hat Python', 45, 'Python programming for hackers.', '🐍')")
        c.execute("INSERT INTO products (name, price, desc, image) VALUES ('SQL Injection Bible', 30, 'The complete guide to database exploitation.', '💉')")
        c.execute("INSERT INTO products (name, price, desc, image) VALUES ('Zero Day', 25, 'The art of finding unknown vulnerabilities.', '💀')")

    conn.commit()
    conn.close()

# --- TEMPLATES ---
BASE_LAYOUT = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>NeuroShop | Secure Tech Books</title>
    <style>
        :root { --primary: #2563eb; --secondary: #1e293b; --bg: #f8fafc; --text: #334155; }
        body { margin: 0; font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); }
        nav { background: var(--secondary); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
        .logo { color: white; font-weight: 800; font-size: 1.5rem; text-decoration: none; }
        .nav-links a { color: #cbd5e1; text-decoration: none; margin-left: 20px; }
        .container { max-width: 1200px; margin: 40px auto; padding: 0 20px; }
        .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .btn { background: var(--primary); color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; }
        input, textarea { width: 100%; padding: 10px; margin: 5px 0 15px 0; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box; }
        .comment { border-bottom: 1px solid #eee; padding: 10px 0; }
        .comment-user { font-weight: bold; color: var(--secondary); }
    </style>
</head>
<body>
    <nav>
        <a href="/" class="logo">🧠 NeuroShop</a>
        <div class="nav-links">
            <a href="/">Books</a>
            <a href="/search">Search</a>
            <a href="/files">Files</a>
            <a href="/admin">Admin Panel</a> {% if session.get('user') %}
                <a href="/logout">👤 {{ session.user }} (Logout)</a>
            {% else %}
                <a href="/login">Login</a>
            {% endif %}
        </div>
    </nav>
    <div class="container">
        {{ content|safe }}
    </div>
</body>
</html>
"""

PAGE_HOME = """
    <h1>Featured Books</h1>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
        {% for p in products %}
            <div class="card">
                <div style="font-size: 4rem; text-align: center;">{{ p[4] }}</div>
                <h3>{{ p[1] }}</h3>
                <p>${{ p[2] }}</p>
                <a href="/product/{{ p[0] }}" class="btn">View Details</a>
            </div>
        {% endfor %}
    </div>
"""

PAGE_PRODUCT = """
    <div class="card" style="display: flex; gap: 30px;">
        <div style="font-size: 8rem;">{{ product[4] }}</div>
        <div>
            <h1>{{ product[1] }}</h1>
            <h2>${{ product[2] }}</h2>
            <p>{{ product[3] }}</p>
            <a href="/" style="color: #64748b;">&larr; Back</a>
        </div>
    </div>

    <div class="card">
        <h3>User Reviews</h3>
        {% for r in reviews %}
            <div class="comment">
                <div class="comment-user">{{ r[2] }} says:</div>
                <div>{{ r[3]|safe }}</div>
            </div>
        {% else %}
            <p>No reviews yet.</p>
        {% endfor %}

        <h4 style="margin-top: 30px;">Leave a Review</h4>
        <form method="POST">
            <input type="text" name="user" placeholder="Your Name" required>
            <textarea name="comment" placeholder="Write a review..." rows="3" required></textarea>
            <button type="submit" class="btn">Post Review</button>
        </form>
    </div>
"""

PAGE_ADMIN = """
    <div class="card">
        <h1>⚙️ Admin Diagnostic Tool</h1>
        <p>Use this tool to verify server connectivity.</p>

        <form method="POST">
            <label>Target IP / Host:</label>
            <input type="text" name="ip" placeholder="e.g., 8.8.8.8" value="{{ last_ip }}">
            <button type="submit" class="btn" style="background: #ef4444;">Run System Ping</button>
        </form>

        {% if output %}
            <div style="background: #1e1e1e; color: #0f0; padding: 15px; margin-top: 20px; border-radius: 6px; font-family: monospace; white-space: pre-wrap;">
{{ output }}
            </div>
        {% endif %}
    </div>

    <div class="card" style="margin-top: 20px;">
        <h1>🌐 URL Fetcher</h1>
        <p>Fetch content from a remote URL for diagnostics.</p>

        <form method="POST" action="/admin/fetch">
            <label>URL to fetch:</label>
            <input type="text" name="url" placeholder="e.g., https://example.com" value="{{ last_url }}">
            <button type="submit" class="btn" style="background: #ef4444;">Fetch URL</button>
        </form>

        {% if fetch_output %}
            <div style="background: #1e1e1e; color: #0f0; padding: 15px; margin-top: 20px; border-radius: 6px; font-family: monospace; white-space: pre-wrap; max-height: 300px; overflow-y: auto;">
{{ fetch_output }}
            </div>
        {% endif %}
    </div>
"""

PAGE_SEARCH = """
    <div class="card">
        <h1>🔍 Search Books</h1>
        <form method="GET" action="/search">
            <input type="text" name="q" placeholder="Search for a book..." value="{{ query }}">
            <button type="submit" class="btn">Search</button>
        </form>
    </div>

    {% if query %}
        <div class="card">
            <h3>Results for: {{ query|safe }}</h3>
            {% if results %}
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;">
                    {% for p in results %}
                        <div style="padding: 15px; border: 1px solid #eee; border-radius: 8px;">
                            <div style="font-size: 3rem; text-align: center;">{{ p[4] }}</div>
                            <h4>{{ p[1] }}</h4>
                            <p>${{ p[2] }}</p>
                            <a href="/product/{{ p[0] }}" class="btn">View</a>
                        </div>
                    {% endfor %}
                </div>
            {% else %}
                <p>No books found matching your search.</p>
            {% endif %}
        </div>
    {% endif %}
"""

PAGE_FILES = """
    <div class="card">
        <h1>📁 Document Viewer</h1>
        <p>View product documentation and spec sheets.</p>
        <form method="GET" action="/files">
            <label>File name:</label>
            <input type="text" name="name" placeholder="e.g., readme.txt" value="{{ filename }}">
            <button type="submit" class="btn">Open File</button>
        </form>
    </div>

    {% if file_content %}
        <div class="card">
            <h3>Contents of: {{ filename }}</h3>
            <div style="background: #1e1e1e; color: #0f0; padding: 15px; border-radius: 6px; font-family: monospace; white-space: pre-wrap; max-height: 400px; overflow-y: auto;">
{{ file_content }}
            </div>
        </div>
    {% endif %}

    {% if file_error %}
        <div class="card" style="border-left: 4px solid #ef4444;">
            <p style="color: #ef4444;">{{ file_error }}</p>
        </div>
    {% endif %}
"""

# --- ROUTES ---

@app.route('/')
def home():
    conn = sqlite3.connect('shop.db')
    products = conn.execute("SELECT * FROM products").fetchall()
    conn.close()
    content = render_template_string(PAGE_HOME, products=products)
    return render_template_string(BASE_LAYOUT, content=content, session=session)

@app.route('/product/<id>', methods=['GET', 'POST'])
def product(id):
    conn = sqlite3.connect('shop.db')

    # Handle New Review (Stored XSS Input)
    if request.method == 'POST':
        user = request.form.get('user')
        comment = request.form.get('comment')
        # VULNERABLE: No sanitization before insert
        conn.execute(f"INSERT INTO reviews (product_id, user, comment) VALUES ({id}, '{user}', '{comment}')")
        conn.commit()

    # Fetch Product & Reviews (Stored XSS Output)
    product = conn.execute(f"SELECT * FROM products WHERE id = {id}").fetchone()
    reviews = conn.execute(f"SELECT * FROM reviews WHERE product_id = {id}").fetchall()
    conn.close()

    if product:
        content = render_template_string(PAGE_PRODUCT, product=product, reviews=reviews)
    else:
        content = "<h1>404 Not Found</h1>"
    return render_template_string(BASE_LAYOUT, content=content, session=session)

@app.route('/admin', methods=['GET', 'POST'])
def admin():
    output = ""
    ip = ""
    if request.method == 'POST':
        ip = request.form.get('ip')
        # VULNERABLE: Command Injection
        # We pass the input directly to the shell
        param = '-n' if platform.system().lower() == 'windows' else '-c'
        cmd = f"ping {param} 1 {ip}"

        try:
            # shell=True allows chaining commands with && or |
            output = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT).decode('utf-8')
        except subprocess.CalledProcessError as e:
            output = e.output.decode('utf-8')
        except Exception as e:
            output = str(e)

    content = render_template_string(PAGE_ADMIN, output=output, last_ip=ip, fetch_output="", last_url="")
    return render_template_string(BASE_LAYOUT, content=content, session=session)

# VULNERABLE: SSRF - Server-Side Request Forgery
# No URL validation — attacker can fetch internal resources
@app.route('/admin/fetch', methods=['POST'])
def admin_fetch():
    url = request.form.get('url', '')
    fetch_output = ""

    if url:
        try:
            # VULNERABLE: No validation of the URL target
            # Attacker can access internal services: http://169.254.169.254/latest/meta-data/
            # Or scan internal network: http://192.168.1.1/, http://127.0.0.1:3306/
            resp = req_lib.get(url, timeout=5)
            fetch_output = resp.text[:3000]
        except Exception as e:
            fetch_output = f"Error: {e}"

    content = render_template_string(PAGE_ADMIN, output="", last_ip="", fetch_output=fetch_output, last_url=url)
    return render_template_string(BASE_LAYOUT, content=content, session=session)

# VULNERABLE: Reflected XSS + SQL Injection in search
@app.route('/search')
def search():
    q = request.args.get('q', '')
    results = []

    if q:
        conn = sqlite3.connect(DB_FILE)
        # VULNERABLE: SQL Injection in LIKE query
        results = conn.execute(f"SELECT * FROM products WHERE name LIKE '%{q}%'").fetchall()
        conn.close()

    # VULNERABLE: Reflected XSS — query reflected via |safe in template
    content = render_template_string(PAGE_SEARCH, query=q, results=results)
    return render_template_string(BASE_LAYOUT, content=content, session=session)

# VULNERABLE: Path Traversal — no sanitization on file path
@app.route('/files')
def files():
    filename = request.args.get('name', '')
    file_content = ""
    file_error = ""

    if filename:
        try:
            # VULNERABLE: Attacker can read arbitrary files
            # e.g., ../../etc/passwd or ..\..\windows\system32\config\sam
            with open(filename, 'r', errors='ignore') as f:
                file_content = f.read()[:3000]
        except FileNotFoundError:
            file_error = f"File not found: {filename}"
        except Exception as e:
            file_error = str(e)

    content = render_template_string(PAGE_FILES, filename=filename, file_content=file_content, file_error=file_error)
    return render_template_string(BASE_LAYOUT, content=content, session=session)

# VULNERABLE: IDOR — Insecure Direct Object Reference
# No authentication check — anyone can view any user's data including passwords
@app.route('/api/user/<id>')
def get_user(id):
    conn = sqlite3.connect(DB_FILE)
    # VULNERABLE: Exposes plaintext passwords, no auth required
    user = conn.execute(f"SELECT id, username, password FROM users WHERE id = {id}").fetchone()
    conn.close()

    if user:
        return jsonify({"id": user[0], "username": user[1], "password": user[2]})
    return jsonify({"error": "User not found"}), 404

# Login/Search routes omitted for brevity (Keep them from previous version if you want)
@app.route('/login', methods=['GET', 'POST'])
def login():
    error = ""
    if request.method == 'POST':
        user = request.form.get('username')
        pwd = request.form.get('password')

        print(f"🔐 Login Attempt: User='{user}', Pass='{pwd}'") # DEBUG PRINT

        conn = sqlite3.connect(DB_FILE)
        # VULNERABLE SQL QUERY
        query = f"SELECT * FROM users WHERE username='{user}' AND password='{pwd}'"
        try:
            u = conn.execute(query).fetchone()
            if u:
                session['user'] = u[1]
                print("✅ Login SUCCESS")
                return redirect('/')
            else:
                print("❌ Login FAILED (Invalid Creds)")
                error = "Invalid Credentials"
        except Exception as e:
            print(f"⚠️ Login ERROR: {e}")
            error = str(e)
        finally:
            conn.close()

    form = f"""
    <div class='card'>
        <h1>Login</h1>
        <p class='error'>{error}</p>
        <form method='POST'>
            <input name='username' placeholder='Username (john)'>
            <input type='password' name='password' placeholder='Password (securepass)'>
            <button>Login</button>
        </form>
    </div>
    """
    return render_template_string(BASE_LAYOUT, content=form, session=session)

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect('/')

if __name__ == '__main__':
    init_db()
    print("🛒 NeuroShop v4.0 (SQLi, XSS, CMDI, SSRF, Path Traversal, IDOR) running on port 5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
