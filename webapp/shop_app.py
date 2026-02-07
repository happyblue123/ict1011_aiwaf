from flask import Flask, request, render_template_string, redirect, url_for, session
import sqlite3
import subprocess # Needed for Command Injection
import platform

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
            <a href="/admin">Admin Panel</a> {% if session.get('user') %}
                <a href="/login">👤 {{ session.user }} (Logout)</a>
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
            
    content = render_template_string(PAGE_ADMIN, output=output, last_ip=ip)
    return render_template_string(BASE_LAYOUT, content=content, session=session)

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
    print("🛒 NeuroShop v3.0 (Now with Stored XSS & Cmd Injection) running on port 5000")
    app.run(host='0.0.0.0', port=5000, debug=True)