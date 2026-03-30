/**
 * Data Warehouse — Seed Script
 *
 * Seeds the `datawarehouse` DB with representative data:
 * 20 sectors, ~40-60 industries, scopes, standards, and mappings.
 *
 * Called via the tRPC `dataWarehouse.seed` mutation.
 */

import { sql } from "drizzle-orm";
import { getWarehouseDb, resetWarehouseDb } from "./connection";
import {
  dwSectors,
  dwIndustries,
  dwScopes,
  dwStandards,
  dwIndustryScopeStandards,
} from "../../../drizzle/tables/data-warehouse";

// ── Seed Data ─────────────────────────────────────────────────────────────────

const SECTORS = [
  { sectorCode: "11", sectorTitle: "Agriculture, Forestry, Fishing and Hunting" },
  { sectorCode: "21", sectorTitle: "Mining, Quarrying, and Oil and Gas Extraction" },
  { sectorCode: "22", sectorTitle: "Utilities" },
  { sectorCode: "23", sectorTitle: "Construction" },
  { sectorCode: "31-33", sectorTitle: "Manufacturing" },
  { sectorCode: "42", sectorTitle: "Wholesale Trade" },
  { sectorCode: "44-45", sectorTitle: "Retail Trade" },
  { sectorCode: "48-49", sectorTitle: "Transportation and Warehousing" },
  { sectorCode: "51", sectorTitle: "Information" },
  { sectorCode: "52", sectorTitle: "Finance and Insurance" },
  { sectorCode: "53", sectorTitle: "Real Estate and Rental and Leasing" },
  { sectorCode: "54", sectorTitle: "Professional, Scientific, and Technical Services" },
  { sectorCode: "55", sectorTitle: "Management of Companies and Enterprises" },
  { sectorCode: "56", sectorTitle: "Administrative and Support and Waste Management" },
  { sectorCode: "61", sectorTitle: "Educational Services" },
  { sectorCode: "62", sectorTitle: "Health Care and Social Assistance" },
  { sectorCode: "71", sectorTitle: "Arts, Entertainment, and Recreation" },
  { sectorCode: "72", sectorTitle: "Accommodation and Food Services" },
  { sectorCode: "81", sectorTitle: "Other Services (except Public Administration)" },
  { sectorCode: "92", sectorTitle: "Public Administration" },
];

const INDUSTRIES = [
  { naicsCode: "111110", industryTitle: "Soybean Farming", sectorCode: "11" },
  { naicsCode: "111160", industryTitle: "Rice Farming", sectorCode: "11" },
  { naicsCode: "111191", industryTitle: "Oilseed and Grain Combination Farming", sectorCode: "11" },
  { naicsCode: "212210", industryTitle: "Iron Ore Mining", sectorCode: "21" },
  { naicsCode: "212220", industryTitle: "Gold Ore and Silver Ore Mining", sectorCode: "21" },
  { naicsCode: "221111", industryTitle: "Hydroelectric Power Generation", sectorCode: "22" },
  { naicsCode: "221112", industryTitle: "Fossil Fuel Electric Power Generation", sectorCode: "22" },
  { naicsCode: "236220", industryTitle: "Commercial and Institutional Building Construction", sectorCode: "23" },
  { naicsCode: "237310", industryTitle: "Highway, Street, and Bridge Construction", sectorCode: "23" },
  { naicsCode: "336111", industryTitle: "Automobile Manufacturing", sectorCode: "31-33" },
  { naicsCode: "336411", industryTitle: "Aircraft Manufacturing", sectorCode: "31-33" },
  { naicsCode: "325411", industryTitle: "Medicinal and Botanical Manufacturing", sectorCode: "31-33" },
  { naicsCode: "424120", industryTitle: "Stationery and Office Supplies Merchant Wholesalers", sectorCode: "42" },
  { naicsCode: "424210", industryTitle: "Drugs and Druggists' Sundries Merchant Wholesalers", sectorCode: "42" },
  { naicsCode: "445110", industryTitle: "Supermarkets and Other Grocery Stores", sectorCode: "44-45" },
  { naicsCode: "445120", industryTitle: "Convenience Retailers", sectorCode: "44-45" },
  { naicsCode: "481111", industryTitle: "Scheduled Passenger Air Transportation", sectorCode: "48-49" },
  { naicsCode: "484110", industryTitle: "General Freight Trucking, Local", sectorCode: "48-49" },
  { naicsCode: "511210", industryTitle: "Software Publishers", sectorCode: "51" },
  { naicsCode: "512110", industryTitle: "Motion Picture and Video Production", sectorCode: "51" },
  { naicsCode: "522110", industryTitle: "Commercial Banking", sectorCode: "52" },
  { naicsCode: "524114", industryTitle: "Direct Health and Medical Insurance Carriers", sectorCode: "52" },
  { naicsCode: "531110", industryTitle: "Lessors of Residential Buildings and Dwellings", sectorCode: "53" },
  { naicsCode: "531210", industryTitle: "Offices of Real Estate Agents and Brokers", sectorCode: "53" },
  { naicsCode: "541511", industryTitle: "Custom Computer Programming Services", sectorCode: "54" },
  { naicsCode: "541611", industryTitle: "Administrative Management Consulting Services", sectorCode: "54" },
  { naicsCode: "551111", industryTitle: "Offices of Bank Holding Companies", sectorCode: "55" },
  { naicsCode: "551112", industryTitle: "Offices of Other Holding Companies", sectorCode: "55" },
  { naicsCode: "561110", industryTitle: "Office Administrative Services", sectorCode: "56" },
  { naicsCode: "562111", industryTitle: "Solid Waste Collection", sectorCode: "56" },
  { naicsCode: "611110", industryTitle: "Elementary and Secondary Schools", sectorCode: "61" },
  { naicsCode: "611310", industryTitle: "Colleges, Universities, and Professional Schools", sectorCode: "61" },
  { naicsCode: "622110", industryTitle: "General Medical and Surgical Hospitals", sectorCode: "62" },
  { naicsCode: "621111", industryTitle: "Offices of Physicians", sectorCode: "62" },
  { naicsCode: "711110", industryTitle: "Theater Companies and Dinner Theaters", sectorCode: "71" },
  { naicsCode: "713110", industryTitle: "Amusement and Theme Parks", sectorCode: "71" },
  { naicsCode: "721110", industryTitle: "Hotels and Motels", sectorCode: "72" },
  { naicsCode: "722511", industryTitle: "Full-Service Restaurants", sectorCode: "72" },
  { naicsCode: "811111", industryTitle: "General Automotive Repair", sectorCode: "81" },
  { naicsCode: "812111", industryTitle: "Barber Shops", sectorCode: "81" },
  { naicsCode: "928120", industryTitle: "International Affairs", sectorCode: "92" },
  { naicsCode: "921110", industryTitle: "Executive Offices", sectorCode: "92" },
];

const SCOPES = [
  // Agriculture
  { sectorCode: "11", scopeId: "S01", scopeLabel: "Farm & agribusiness operations processes and knowledge areas", scopeDescription: "Core PM processes for farming operations" },
  { sectorCode: "11", scopeId: "S02", scopeLabel: "Agricultural enterprise and farm project governance", scopeDescription: "Governance frameworks for agribusiness projects" },
  { sectorCode: "11", scopeId: "S09", scopeLabel: "Precision agriculture and agri-tech systems development", scopeDescription: "Technology-driven precision farming systems" },
  // Mining
  { sectorCode: "21", scopeId: "S01", scopeLabel: "Mining operations project management", scopeDescription: "PM frameworks for mining extraction operations" },
  { sectorCode: "21", scopeId: "S10", scopeLabel: "Mine safety and environmental management", scopeDescription: "OH&S and environmental compliance for mining" },
  // Utilities
  { sectorCode: "22", scopeId: "S01", scopeLabel: "Utility infrastructure project management", scopeDescription: "PM for power generation and distribution projects" },
  { sectorCode: "22", scopeId: "S28", scopeLabel: "Utility systems engineering", scopeDescription: "Systems engineering for utility networks" },
  // Construction
  { sectorCode: "23", scopeId: "S01", scopeLabel: "Construction project management processes", scopeDescription: "Core PM for building and infrastructure projects" },
  { sectorCode: "23", scopeId: "S15", scopeLabel: "Construction capital project value management", scopeDescription: "Value engineering for capital construction" },
  // Manufacturing
  { sectorCode: "31-33", scopeId: "S01", scopeLabel: "Manufacturing operations project management", scopeDescription: "PM for manufacturing process and product projects" },
  { sectorCode: "31-33", scopeId: "S05", scopeLabel: "Manufacturing process maturity", scopeDescription: "Capability maturity for manufacturing processes" },
  { sectorCode: "31-33", scopeId: "S16", scopeLabel: "Manufacturing quality and variation reduction", scopeDescription: "Six Sigma and quality management in manufacturing" },
  // Wholesale Trade
  { sectorCode: "42", scopeId: "S13", scopeLabel: "Wholesale distribution network and infrastructure project management", scopeDescription: "PM for wholesale distribution infrastructure" },
  { sectorCode: "42", scopeId: "S14", scopeLabel: "Wholesale distribution product and service development", scopeDescription: "New service development for wholesale distribution" },
  { sectorCode: "42", scopeId: "S16", scopeLabel: "Wholesale distribution operational variation and error reduction", scopeDescription: "Quality improvement for wholesale operations" },
  // Retail Trade
  { sectorCode: "44-45", scopeId: "S01", scopeLabel: "Retail operations project management", scopeDescription: "PM for retail store and channel operations" },
  { sectorCode: "44-45", scopeId: "S14", scopeLabel: "Retail product and customer experience development", scopeDescription: "Innovation in retail service delivery" },
  // Transportation
  { sectorCode: "48-49", scopeId: "S01", scopeLabel: "Transportation infrastructure project management", scopeDescription: "PM for transportation and logistics projects" },
  { sectorCode: "48-49", scopeId: "S10", scopeLabel: "Transportation safety management systems", scopeDescription: "Safety management for transportation operations" },
  // Information
  { sectorCode: "51", scopeId: "S01", scopeLabel: "IT and media project management processes", scopeDescription: "PM for software, media, and information services" },
  { sectorCode: "51", scopeId: "S09", scopeLabel: "Software and systems development lifecycle", scopeDescription: "SDLC and agile engineering practices" },
  // Finance
  { sectorCode: "52", scopeId: "S01", scopeLabel: "Financial services project management", scopeDescription: "PM for banking, insurance, and fintech projects" },
  { sectorCode: "52", scopeId: "S09", scopeLabel: "Financial technology systems development", scopeDescription: "IT governance for fintech platforms" },
  // Real Estate
  { sectorCode: "53", scopeId: "S01", scopeLabel: "Real estate project management", scopeDescription: "PM for property development and management" },
  { sectorCode: "53", scopeId: "S27", scopeLabel: "Property asset lifecycle management", scopeDescription: "Asset management for real estate portfolios" },
  // Professional Services
  { sectorCode: "54", scopeId: "S01", scopeLabel: "Professional services project management processes", scopeDescription: "PM for consulting and professional service engagements" },
  { sectorCode: "54", scopeId: "S09", scopeLabel: "IT systems development and software engineering", scopeDescription: "Systems development for IT professional services" },
  // Management of Companies
  { sectorCode: "55", scopeId: "S01", scopeLabel: "Corporate project and programme management", scopeDescription: "Enterprise-level programme governance" },
  { sectorCode: "55", scopeId: "S33", scopeLabel: "Corporate portfolio management", scopeDescription: "Portfolio management for holding companies" },
  // Administrative Services
  { sectorCode: "56", scopeId: "S01", scopeLabel: "Administrative services project management", scopeDescription: "PM for administrative and waste management services" },
  { sectorCode: "56", scopeId: "S16", scopeLabel: "Service quality and operational efficiency", scopeDescription: "Quality improvement for support services" },
  // Education
  { sectorCode: "61", scopeId: "S01", scopeLabel: "Educational institution project management", scopeDescription: "PM for educational programme and facility projects" },
  { sectorCode: "61", scopeId: "S30", scopeLabel: "Educational transformation programme lifecycle", scopeDescription: "Programme management for educational reform" },
  // Healthcare
  { sectorCode: "62", scopeId: "S01", scopeLabel: "Healthcare project management processes", scopeDescription: "PM for healthcare facility and service projects" },
  { sectorCode: "62", scopeId: "S10", scopeLabel: "Healthcare safety and patient risk management", scopeDescription: "Patient safety and clinical risk management" },
  // Arts & Entertainment
  { sectorCode: "71", scopeId: "S01", scopeLabel: "Entertainment and event project management", scopeDescription: "PM for entertainment venues and event production" },
  { sectorCode: "71", scopeId: "S14", scopeLabel: "Creative content and experience development", scopeDescription: "Innovation in entertainment experiences" },
  // Accommodation & Food
  { sectorCode: "72", scopeId: "S01", scopeLabel: "Hospitality operations project management", scopeDescription: "PM for hotel and food service operations" },
  { sectorCode: "72", scopeId: "S16", scopeLabel: "Hospitality service quality management", scopeDescription: "Quality and consistency in hospitality" },
  // Other Services
  { sectorCode: "81", scopeId: "S01", scopeLabel: "Service operations project management", scopeDescription: "PM for repair, maintenance, and personal services" },
  { sectorCode: "81", scopeId: "S14", scopeLabel: "Service innovation and development", scopeDescription: "New service development for personal services" },
  // Public Administration
  { sectorCode: "92", scopeId: "S27", scopeLabel: "Government facility and infrastructure asset lifecycle", scopeDescription: "Asset lifecycle for government infrastructure" },
  { sectorCode: "92", scopeId: "S28", scopeLabel: "Government systems engineering", scopeDescription: "Systems engineering for government technology" },
  { sectorCode: "92", scopeId: "S30", scopeLabel: "Government transformation programme lifecycle", scopeDescription: "Programme management for government modernisation" },
  { sectorCode: "92", scopeId: "S33", scopeLabel: "Government portfolio management", scopeDescription: "Portfolio governance for government investments" },
];

const STANDARDS = [
  { standardCode: "PMBOK 7th Ed.", standardName: "A Guide to the Project Management Body of Knowledge", issuingBody: "PMI" },
  { standardCode: "ISO 21500:2021", standardName: "Project, programme and portfolio management — Context and concepts", issuingBody: "ISO/TC 258" },
  { standardCode: "PRINCE2 7th Ed.", standardName: "Projects IN Controlled Environments", issuingBody: "AXELOS / PeopleCert" },
  { standardCode: "ISO 9001:2015", standardName: "Quality management systems — Requirements", issuingBody: "ISO/TC 176" },
  { standardCode: "ISO 45001:2018", standardName: "Occupational health and safety management systems — Requirements", issuingBody: "ISO/TC 283" },
  { standardCode: "ISO 55001:2014", standardName: "Asset management — Management systems — Requirements", issuingBody: "ISO/TC 251" },
  { standardCode: "ISO 21505:2017", standardName: "Project, programme and portfolio management — Guidance on governance", issuingBody: "ISO/TC 258" },
  { standardCode: "CMMI-DEV v2.0", standardName: "Capability Maturity Model Integration for Development", issuingBody: "ISACA / CMMI Institute" },
  { standardCode: "Six Sigma DMAIC", standardName: "Six Sigma Define-Measure-Analyse-Improve-Control Methodology", issuingBody: "ASQ / IASSC" },
  { standardCode: "TOGAF 10", standardName: "The Open Group Architecture Framework", issuingBody: "The Open Group" },
  { standardCode: "MSP 5th Ed.", standardName: "Managing Successful Programmes", issuingBody: "AXELOS / PeopleCert" },
  { standardCode: "LFA / LogFrame", standardName: "Logical Framework Approach", issuingBody: "USAID / FAO / IFAD" },
  { standardCode: "GLOBALG.A.P. IFA v6", standardName: "Integrated Farm Assurance Standard", issuingBody: "GLOBALG.A.P. / FoodPLUS GmbH" },
  { standardCode: "NIST SP 800-53", standardName: "Security and Privacy Controls for Information Systems", issuingBody: "NIST" },
  { standardCode: "FedRAMP", standardName: "Federal Risk and Authorization Management Program", issuingBody: "US GSA" },
  { standardCode: "ISO/IEC 27001:2022", standardName: "Information security management systems — Requirements", issuingBody: "ISO/IEC JTC 1/SC 27" },
  { standardCode: "ISO 11783 (ISOBUS)", standardName: "Tractors and Machinery — Serial Control and Communications Data Network", issuingBody: "ISO/TC 23/SC 19" },
  { standardCode: "RBM", standardName: "Results-Based Management Framework", issuingBody: "UNDP / IFAD" },
  { standardCode: "IFC Performance Standards", standardName: "IFC Performance Standards on Environmental and Social Sustainability", issuingBody: "International Finance Corporation" },
  { standardCode: "PMI Standard for Portfolio Mgmt", standardName: "The Standard for Portfolio Management", issuingBody: "PMI" },
  { standardCode: "MoP", standardName: "Management of Portfolios", issuingBody: "AXELOS / PeopleCert" },
  { standardCode: "PMI Standard for Program Mgmt 4th Ed.", standardName: "The Standard for Program Management", issuingBody: "PMI" },
  { standardCode: "FIDIC Yellow Book", standardName: "Conditions of Contract for Plant and Design-Build", issuingBody: "FIDIC" },
  { standardCode: "ISO 9001:2015 Clause 8.3", standardName: "Product and Service Design and Development Requirements", issuingBody: "ISO/TC 176" },
  { standardCode: "Stage Gate Process", standardName: "Stage-Gate Innovation Management", issuingBody: "Stage-Gate International" },
  { standardCode: "ISO/IEC/IEEE 15288:2023", standardName: "Systems and software engineering — System life cycle processes", issuingBody: "ISO/IEC JTC 1/SC 7" },
  { standardCode: "NIST SP 800-34", standardName: "Contingency Planning Guide for Federal Information Systems", issuingBody: "NIST" },
  { standardCode: "GAO Capital Planning", standardName: "GAO standards for government capital planning and portfolio governance", issuingBody: "US GAO" },
  { standardCode: "ISO 14001:2015", standardName: "Environmental management systems — Requirements", issuingBody: "ISO/TC 207" },
  { standardCode: "ISO 31000:2018", standardName: "Risk management — Guidelines", issuingBody: "ISO/TC 262" },
];

const MAPPINGS = [
  // Sector 11 — Agriculture
  { naicsCode: "111110", sectorCode: "11", scopeId: "S01", standardCode: "PMBOK 7th Ed.", standardNameContextual: null, relevance: "Defines 12 principles and 8 performance domains directly applicable to agribusiness capital and operational projects" },
  { naicsCode: "111110", sectorCode: "11", scopeId: "S01", standardCode: "ISO 21500:2021", standardNameContextual: null, relevance: "International PM guidance standard applicable to agricultural infrastructure, irrigation and technology projects" },
  { naicsCode: "111110", sectorCode: "11", scopeId: "S01", standardCode: "LFA / LogFrame", standardNameContextual: null, relevance: "The primary project design and M&E tool used by IFAD, FAO and development agencies for agricultural development projects" },
  { naicsCode: "111110", sectorCode: "11", scopeId: "S01", standardCode: "RBM", standardNameContextual: null, relevance: "Framework for defining outcomes, indicators and accountability in large-scale agricultural programs" },
  { naicsCode: "111110", sectorCode: "11", scopeId: "S01", standardCode: "GLOBALG.A.P. IFA v6", standardNameContextual: null, relevance: "Defines all-farm operational processes for crops, livestock and aquaculture" },
  { naicsCode: "111110", sectorCode: "11", scopeId: "S02", standardCode: "PRINCE2 7th Ed.", standardNameContextual: null, relevance: "Provides a governance-first project method with defined roles applicable to agribusiness capital and development projects" },
  { naicsCode: "111110", sectorCode: "11", scopeId: "S02", standardCode: "ISO 21505:2017", standardNameContextual: null, relevance: "Defines governance principles for projects and programs, applicable to farm cooperative and agribusiness structures" },
  { naicsCode: "111110", sectorCode: "11", scopeId: "S02", standardCode: "IFC Performance Standards", standardNameContextual: null, relevance: "Mandatory governance and ESG standards for agribusiness enterprises receiving IFC or development finance" },
  { naicsCode: "111110", sectorCode: "11", scopeId: "S09", standardCode: "ISO/IEC 27001:2022", standardNameContextual: null, relevance: "Governs security of farm data management systems, precision agriculture platforms and connected agricultural IoT deployments" },
  { naicsCode: "111110", sectorCode: "11", scopeId: "S09", standardCode: "ISO 11783 (ISOBUS)", standardNameContextual: null, relevance: "International communication standard for agricultural machinery data networks, the foundation of precision agriculture interoperability" },
  { naicsCode: "111160", sectorCode: "11", scopeId: "S01", standardCode: "PMBOK 7th Ed.", standardNameContextual: null, relevance: "Core PM framework for rice farming operational and capital projects" },
  { naicsCode: "111160", sectorCode: "11", scopeId: "S01", standardCode: "LFA / LogFrame", standardNameContextual: null, relevance: "Primary project design and M&E tool for rice farming development projects" },
  // Sector 21 — Mining
  { naicsCode: "212210", sectorCode: "21", scopeId: "S01", standardCode: "PMBOK 7th Ed.", standardNameContextual: null, relevance: "Core PM framework for mining extraction and processing capital projects" },
  { naicsCode: "212210", sectorCode: "21", scopeId: "S01", standardCode: "ISO 21500:2021", standardNameContextual: null, relevance: "International PM guidance for mining infrastructure and exploration projects" },
  { naicsCode: "212210", sectorCode: "21", scopeId: "S10", standardCode: "ISO 45001:2018", standardNameContextual: null, relevance: "Primary OH&S management standard for mining operations covering underground and surface safety" },
  { naicsCode: "212210", sectorCode: "21", scopeId: "S10", standardCode: "ISO 14001:2015", standardNameContextual: null, relevance: "Environmental management for mining operations including waste, water, and land rehabilitation" },
  // Sector 22 — Utilities
  { naicsCode: "221111", sectorCode: "22", scopeId: "S01", standardCode: "PMBOK 7th Ed.", standardNameContextual: null, relevance: "PM framework for hydroelectric power generation and distribution projects" },
  { naicsCode: "221111", sectorCode: "22", scopeId: "S28", standardCode: "ISO/IEC/IEEE 15288:2023", standardNameContextual: null, relevance: "Systems engineering lifecycle for power generation and smart grid systems" },
  // Sector 23 — Construction
  { naicsCode: "236220", sectorCode: "23", scopeId: "S01", standardCode: "PMBOK 7th Ed.", standardNameContextual: null, relevance: "Core PM standard for commercial and institutional building construction projects" },
  { naicsCode: "236220", sectorCode: "23", scopeId: "S01", standardCode: "PRINCE2 7th Ed.", standardNameContextual: null, relevance: "Governance-first project method for large construction programmes" },
  { naicsCode: "236220", sectorCode: "23", scopeId: "S15", standardCode: "FIDIC Yellow Book", standardNameContextual: null, relevance: "Standard contract framework for design-build construction projects" },
  // Sector 31-33 — Manufacturing
  { naicsCode: "336111", sectorCode: "31-33", scopeId: "S01", standardCode: "PMBOK 7th Ed.", standardNameContextual: null, relevance: "PM framework for automobile manufacturing product development and facility projects" },
  { naicsCode: "336111", sectorCode: "31-33", scopeId: "S05", standardCode: "CMMI-DEV v2.0", standardNameContextual: null, relevance: "Process maturity model for automotive manufacturing development processes" },
  { naicsCode: "336111", sectorCode: "31-33", scopeId: "S16", standardCode: "Six Sigma DMAIC", standardNameContextual: null, relevance: "Statistical improvement methodology for reducing manufacturing defects and variation" },
  { naicsCode: "336111", sectorCode: "31-33", scopeId: "S16", standardCode: "ISO 9001:2015", standardNameContextual: null, relevance: "Quality management system requirements for automotive manufacturing" },
  // Sector 42 — Wholesale Trade
  { naicsCode: "424120", sectorCode: "42", scopeId: "S13", standardCode: "PMBOK 7th Ed.", standardNameContextual: null, relevance: "Core PM framework for wholesale distribution infrastructure projects — DC construction, automation installation" },
  { naicsCode: "424120", sectorCode: "42", scopeId: "S13", standardCode: "ISO 55001:2014", standardNameContextual: null, relevance: "Asset lifecycle management for wholesale distribution fleet, material handling equipment and warehouse infrastructure" },
  { naicsCode: "424120", sectorCode: "42", scopeId: "S13", standardCode: "FIDIC Yellow Book", standardNameContextual: null, relevance: "Contract framework for wholesale distribution centre design-build and automated material handling installation projects" },
  { naicsCode: "424120", sectorCode: "42", scopeId: "S14", standardCode: "ISO 9001:2015 Clause 8.3", standardNameContextual: null, relevance: "QMS design and development requirements applicable to new wholesale distribution service development" },
  { naicsCode: "424120", sectorCode: "42", scopeId: "S14", standardCode: "Stage Gate Process", standardNameContextual: null, relevance: "Commercial innovation framework for managing wholesale distribution new service development" },
  { naicsCode: "424120", sectorCode: "42", scopeId: "S16", standardCode: "Six Sigma DMAIC", standardNameContextual: null, relevance: "Statistical improvement methodology for reducing wholesale distribution picking errors and fill rate variability" },
  // Sector 51 — Information
  { naicsCode: "541511", sectorCode: "54", scopeId: "S01", standardCode: "PMBOK 7th Ed.", standardNameContextual: null, relevance: "Core PM standard for IT professional services engagements" },
  { naicsCode: "541511", sectorCode: "54", scopeId: "S01", standardCode: "ISO 21500:2021", standardNameContextual: null, relevance: "International PM guidance for software and IT professional services projects" },
  { naicsCode: "541511", sectorCode: "54", scopeId: "S09", standardCode: "ISO/IEC 27001:2022", standardNameContextual: null, relevance: "Security management for custom software development environments and client data protection" },
  { naicsCode: "541511", sectorCode: "54", scopeId: "S09", standardCode: "CMMI-DEV v2.0", standardNameContextual: null, relevance: "Software development process maturity model for custom programming services organisations" },
  // Sector 52 — Finance
  { naicsCode: "522110", sectorCode: "52", scopeId: "S01", standardCode: "PMBOK 7th Ed.", standardNameContextual: null, relevance: "PM framework for banking technology and regulatory compliance projects" },
  { naicsCode: "522110", sectorCode: "52", scopeId: "S09", standardCode: "ISO/IEC 27001:2022", standardNameContextual: null, relevance: "Information security for banking systems, fintech platforms, and customer data" },
  { naicsCode: "522110", sectorCode: "52", scopeId: "S09", standardCode: "NIST SP 800-53", standardNameContextual: null, relevance: "Security and privacy controls for financial information systems" },
  // Sector 62 — Healthcare
  { naicsCode: "622110", sectorCode: "62", scopeId: "S01", standardCode: "PMBOK 7th Ed.", standardNameContextual: null, relevance: "PM framework for hospital construction, expansion, and clinical system projects" },
  { naicsCode: "622110", sectorCode: "62", scopeId: "S10", standardCode: "ISO 45001:2018", standardNameContextual: null, relevance: "OH&S management for hospital operations, clinical staff safety, and hazardous materials" },
  { naicsCode: "622110", sectorCode: "62", scopeId: "S10", standardCode: "ISO 31000:2018", standardNameContextual: null, relevance: "Risk management framework for clinical risk, patient safety, and healthcare operations" },
  // Sector 92 — Public Administration
  { naicsCode: "928120", sectorCode: "92", scopeId: "S27", standardCode: "ISO 55001:2014", standardNameContextual: "Asset management for government public infrastructure", relevance: "Asset lifecycle management for government infrastructure — federal buildings, roads, bridges, military installations" },
  { naicsCode: "928120", sectorCode: "92", scopeId: "S27", standardCode: "NIST SP 800-34", standardNameContextual: "Government IT system lifecycle and contingency planning", relevance: "Federal contingency planning lifecycle from system development through operations to decommissioning" },
  { naicsCode: "928120", sectorCode: "92", scopeId: "S28", standardCode: "ISO/IEC/IEEE 15288:2023", standardNameContextual: "Systems engineering for government enterprise technology", relevance: "Systems lifecycle for complex government technology ecosystems including enterprise systems and regulatory platforms" },
  { naicsCode: "928120", sectorCode: "92", scopeId: "S28", standardCode: "TOGAF 10", standardNameContextual: "Enterprise architecture for government technology systems", relevance: "Enterprise architecture for government agencies designing connected citizen services and regulatory technology" },
  { naicsCode: "928120", sectorCode: "92", scopeId: "S30", standardCode: "MSP 5th Ed.", standardNameContextual: "Managing Successful Programmes for government transformation", relevance: "Programme lifecycle for multi-year government modernisation and digital transformation programmes" },
  { naicsCode: "928120", sectorCode: "92", scopeId: "S30", standardCode: "PMI Standard for Program Mgmt 4th Ed.", standardNameContextual: "The Standard for Program Management for government programmes", relevance: "Program benefits lifecycle for government technology modernisation and organisational transformation" },
  { naicsCode: "928120", sectorCode: "92", scopeId: "S33", standardCode: "PMI Standard for Portfolio Mgmt", standardNameContextual: "Portfolio management for government agencies", relevance: "Portfolio governance for aligning government capital, technology and programme investments with mission objectives" },
  { naicsCode: "928120", sectorCode: "92", scopeId: "S33", standardCode: "MoP", standardNameContextual: "Strategic portfolio management for government departments", relevance: "Portfolio management for government departments balancing capital, technology and regulatory investment portfolios" },
  { naicsCode: "928120", sectorCode: "92", scopeId: "S33", standardCode: "GAO Capital Planning", standardNameContextual: null, relevance: "Government auditing standards for evaluating capital investment portfolio governance and IT programme decision-making" },
];

// ── Seed Execution ────────────────────────────────────────────────────────────

export async function seedDataWarehouse() {
  const db = getWarehouseDb();
  if (!db) throw new Error("Cannot connect to datawarehouse DB");

  // Create tables if they don't exist (via raw SQL from Drizzle schema)
  // Using Drizzle's push-style: we create tables with IF NOT EXISTS
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dw_sectors (
      id SERIAL PRIMARY KEY,
      sector_code VARCHAR(10) NOT NULL UNIQUE,
      sector_title VARCHAR(255) NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dw_industries (
      id SERIAL PRIMARY KEY,
      naics_code VARCHAR(10) NOT NULL UNIQUE,
      industry_title VARCHAR(255) NOT NULL,
      sector_code VARCHAR(10) NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dw_scopes (
      id SERIAL PRIMARY KEY,
      sector_code VARCHAR(10) NOT NULL,
      scope_id VARCHAR(10) NOT NULL,
      scope_label VARCHAR(255) NOT NULL,
      scope_description TEXT NOT NULL DEFAULT ''
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dw_standards (
      id SERIAL PRIMARY KEY,
      standard_code VARCHAR(100) NOT NULL UNIQUE,
      standard_name VARCHAR(500) NOT NULL,
      issuing_body VARCHAR(255) NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS dw_industry_scope_standards (
      id SERIAL PRIMARY KEY,
      naics_code VARCHAR(10) NOT NULL,
      sector_code VARCHAR(10) NOT NULL,
      scope_id VARCHAR(10) NOT NULL,
      standard_code VARCHAR(100) NOT NULL,
      standard_name_contextual VARCHAR(500),
      relevance TEXT NOT NULL
    )
  `);

  // Create indexes
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dw_industries_sector ON dw_industries(sector_code)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dw_scopes_sector ON dw_scopes(sector_code)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dw_scopes_unique ON dw_scopes(sector_code, scope_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dw_iss_naics ON dw_industry_scope_standards(naics_code)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dw_iss_scope ON dw_industry_scope_standards(scope_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dw_iss_standard ON dw_industry_scope_standards(standard_code)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dw_iss_sector ON dw_industry_scope_standards(sector_code)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_dw_iss_composite ON dw_industry_scope_standards(naics_code, scope_id, standard_code)`);

  // Clear existing data (idempotent re-seed)
  await db.delete(dwIndustryScopeStandards);
  await db.delete(dwScopes);
  await db.delete(dwIndustries);
  await db.delete(dwStandards);
  await db.delete(dwSectors);

  // Insert seed data
  await db.insert(dwSectors).values(SECTORS);
  await db.insert(dwIndustries).values(INDUSTRIES);
  await db.insert(dwScopes).values(SCOPES);
  await db.insert(dwStandards).values(STANDARDS);
  await db.insert(dwIndustryScopeStandards).values(MAPPINGS);

  // Reset connection to pick up new tables
  resetWarehouseDb();

  return {
    sectors: SECTORS.length,
    industries: INDUSTRIES.length,
    scopes: SCOPES.length,
    standards: STANDARDS.length,
    mappings: MAPPINGS.length,
  };
}
