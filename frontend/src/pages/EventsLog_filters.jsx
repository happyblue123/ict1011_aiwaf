// This is a code snippet showing the additions made to EventsLog.jsx

// Add these states to the EventsLog component at the top after the other state declarations:
const [searchQuery, setSearchQuery] = useState('');
const [attackTypeFilter, setAttackTypeFilter] = useState('all');
const [actionFilter, setActionFilter] = useState('all');
const [countryFilter, setCountryFilter] = useState('all');
const [methodFilter, setMethodFilter] = useState('all');
const [ipFilter, setIpFilter] = useState('');
const [showFilters, setShowFilters] = useState(false);

// Add these parameters to the queryParams in fetchLogs():
if (searchQuery.trim()) queryParams.search = searchQuery;
if (attackTypeFilter !== 'all') queryParams.attack_type_filter = attackTypeFilter;
if (actionFilter !== 'all') queryParams.action_filter = actionFilter;
if (countryFilter !== 'all') queryParams.country_filter = countryFilter;
if (methodFilter !== 'all') queryParams.method_filter = methodFilter;
if (ipFilter.trim()) queryParams.ip_filter = ipFilter;

// Add a Filter toggle button before the Refresh button in the toolbar:
<button onClick={() => setShowFilters(!showFilters)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors" title="Toggle Filters">
  <Filter size={18} className={showFilters ? 'text-blue-600' : ''} />
</button>

// Add this FILTERS PANEL before the TABLE section (after line 717):
{showFilters && (
  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm space-y-4 mb-4">
    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-4">
      <Filter size={16} className="text-blue-600" />
      Search & Advanced Filters
    </h3>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Search Input - Free text or structured filters */}
      <div className="lg:col-span-2">
        <label className="block text-xs font-bold text-gray-700 mb-2">Search</label>
        <input
          type="text"
          placeholder="Search: path, IP, attack type... or use: ip:192.168.1.1 attack:sql_injection"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 mt-1">💡 Tip: Use prefixes like ip:, attack:, action:, method:, country:</p>
      </div>

      {/* Attack Type Filter */}
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-2">Attack Type</label>
        <select
          value={attackTypeFilter}
          onChange={(e) => {
            setAttackTypeFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">All Types</option>
          <option value="None">Normal Traffic</option>
          <option value="sql_injection">SQL Injection</option>
          <option value="xss">XSS</option>
          <option value="traversal">Path Traversal</option>
          <option value="cmd_injection">Command Injection</option>
        </select>
      </div>

      {/* Action Filter */}
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-2">Action Taken</label>
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">All Actions</option>
          <option value="BLOCKED">Blocked</option>
          <option value="FLAGGED">Flagged</option>
          <option value="ALLOWED">Allowed</option>
        </select>
      </div>

      {/* HTTP Method Filter */}
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-2">HTTP Method</label>
        <select
          value={methodFilter}
          onChange={(e) => {
            setMethodFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">All Methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
        </select>
      </div>

      {/* Country Filter */}
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-2">Country</label>
        <select
          value={countryFilter}
          onChange={(e) => {
            setCountryFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="all">All Countries</option>
          <option value="Russia">Russia</option>
          <option value="China">China</option>
          <option value="Iran">Iran</option>
          <option value="Local">Local</option>
        </select>
      </div>

      {/* IP Filter */}
      <div>
        <label className="block text-xs font-bold text-gray-700 mb-2">Source IP</label>
        <input
          type="text"
          placeholder="e.g., 192.168.1.1"
          value={ipFilter}
          onChange={(e) => {
            setIpFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>

    {/* Clear Filters Button */}
    {(searchQuery || attackTypeFilter !== 'all' || actionFilter !== 'all' || countryFilter !== 'all' || methodFilter !== 'all' || ipFilter) && (
      <div className="flex justify-end pt-2 border-t border-blue-200">
        <button
          onClick={() => {
            setSearchQuery('');
            setAttackTypeFilter('all');
            setActionFilter('all');
            setCountryFilter('all');
            setMethodFilter('all');
            setIpFilter('');
            setCurrentPage(1);
          }}
          className="text-xs font-bold text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
        >
          Clear All Filters
        </button>
      </div>
    )}
  </div>
)}
